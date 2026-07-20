import "server-only";

import { inflateSync } from "node:zlib";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import {
  type EvidenceMimeType,
  MAX_EVIDENCE_UPLOAD_BYTES,
  type UploadMetadata,
  type UploadPolicyFailureCode,
  validateEvidenceUploadMetadata,
} from "@/shared/auth/upload-policy";

export interface PrivateUploadValidationInput extends UploadMetadata {
  bytes: Uint8Array;
  expectedSha256Hex: string;
}

export interface VerifiedPrivateUpload {
  byteSize: number;
  fileName: string;
  mimeType: EvidenceMimeType;
  sha256Hex: string;
}

export type PrivateUploadValidationFailureCode =
  | UploadPolicyFailureCode
  | "byte_size_mismatch"
  | "invalid_sha256"
  | "sha256_mismatch"
  | "invalid_content"
  | "hash_unavailable";

export type PrivateUploadValidationResult =
  | {
      accepted: true;
      code: "accepted";
      upload: VerifiedPrivateUpload;
    }
  | {
      accepted: false;
      code: PrivateUploadValidationFailureCode;
    };

const MAX_IMAGE_PIXELS = 16_777_216;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const PDF_TAIL_SCAN_BYTES = 65_536;
const JPEG_SUPPORTED_FRAMES = new Set([0xc0, 0xc2]);
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

type PrivateUploadProperty = keyof PrivateUploadValidationInput;

function readProperty(value: unknown, property: PrivateUploadProperty): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }

  try {
    return Reflect.get(value, property);
  } catch {
    return undefined;
  }
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return (
    bytes.byteLength >= prefix.byteLength &&
    prefix.every((value, index) => bytes[index] === value)
  );
}

function isUint8Array(value: unknown): value is Uint8Array {
  try {
    return (
      ArrayBuffer.isView(value) &&
      Object.prototype.toString.call(value) === "[object Uint8Array]"
    );
  } catch {
    return false;
  }
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let value = "";
  for (let index = start; index < start + length; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let checksum = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    const tableIndex = (checksum ^ (bytes[index] ?? 0)) & 0xff;
    checksum = (CRC32_TABLE[tableIndex] ?? 0) ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function hasValidPngBitDepth(bitDepth: number, colourType: number): boolean {
  switch (colourType) {
    case 0:
      return [1, 2, 4, 8, 16].includes(bitDepth);
    case 2:
    case 4:
    case 6:
      return bitDepth === 8 || bitDepth === 16;
    case 3:
      return [1, 2, 4, 8].includes(bitDepth);
    default:
      return false;
  }
}

function hasValidPngStructure(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, PNG_SIGNATURE)) {
    return false;
  }

  let offset = PNG_SIGNATURE.byteLength;
  let chunkIndex = 0;
  let colourType: number | null = null;
  let foundPalette = false;
  let foundImageData = false;
  let imageDataClosed = false;

  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const chunkEnd = crcOffset + 4;
    if (
      !Number.isSafeInteger(chunkEnd) ||
      crcOffset < dataOffset ||
      chunkEnd > bytes.byteLength
    ) {
      return false;
    }

    const type = ascii(bytes, offset + 4, 4);
    if (
      !/^[A-Za-z]{4}$/u.test(type) ||
      (type.charCodeAt(2) & 0x20) !== 0 ||
      readUint32(bytes, crcOffset) !== crc32(bytes, offset + 4, crcOffset)
    ) {
      return false;
    }

    if (
      (type.charCodeAt(0) & 0x20) === 0 &&
      !PNG_CRITICAL_CHUNKS.has(type)
    ) {
      return false;
    }

    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) {
        return false;
      }
      const width = readUint32(bytes, dataOffset);
      const height = readUint32(bytes, dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8] ?? 0;
      colourType = bytes[dataOffset + 9] ?? -1;
      if (
        width === 0 ||
        height === 0 ||
        width > MAX_IMAGE_PIXELS ||
        height > MAX_IMAGE_PIXELS ||
        width * height > MAX_IMAGE_PIXELS ||
        !hasValidPngBitDepth(bitDepth, colourType) ||
        bytes[dataOffset + 10] !== 0 ||
        bytes[dataOffset + 11] !== 0 ||
        ![0, 1].includes(bytes[dataOffset + 12] ?? -1)
      ) {
        return false;
      }
    } else if (type === "IHDR") {
      return false;
    }

    if (type === "PLTE") {
      if (
        foundPalette ||
        foundImageData ||
        length === 0 ||
        length > 768 ||
        length % 3 !== 0 ||
        colourType === 0 ||
        colourType === 4
      ) {
        return false;
      }
      foundPalette = true;
    } else if (type === "IDAT") {
      if (imageDataClosed || length === 0) {
        return false;
      }
      foundImageData = true;
    } else if (foundImageData && type !== "IEND") {
      imageDataClosed = true;
    }

    if (type === "IEND") {
      return (
        length === 0 &&
        foundImageData &&
        (colourType !== 3 || foundPalette) &&
        chunkEnd === bytes.byteLength
      );
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  return false;
}

interface JpegMarker {
  code: number;
  nextOffset: number;
}

interface JpegSegment {
  end: number;
  payloadLength: number;
  payloadOffset: number;
}

interface JpegFrame {
  componentQuantizationTables: ReadonlyMap<number, number>;
  progressive: boolean;
}

function readJpegMarker(bytes: Uint8Array, offset: number): JpegMarker | null {
  if (bytes[offset] !== 0xff) {
    return null;
  }

  let markerOffset = offset + 1;
  while (markerOffset < bytes.byteLength && bytes[markerOffset] === 0xff) {
    markerOffset += 1;
  }
  const code = bytes[markerOffset];
  if (code === undefined || code === 0x00) {
    return null;
  }
  return { code, nextOffset: markerOffset + 1 };
}

function readJpegSegment(bytes: Uint8Array, offset: number): JpegSegment | null {
  if (offset + 2 > bytes.byteLength) {
    return null;
  }

  const segmentLength = readUint16(bytes, offset);
  if (segmentLength < 2) {
    return null;
  }

  const end = offset + segmentLength;
  if (end > bytes.byteLength) {
    return null;
  }

  return {
    end,
    payloadLength: segmentLength - 2,
    payloadOffset: offset + 2,
  };
}

function parseJpegQuantizationTables(
  bytes: Uint8Array,
  segment: JpegSegment,
  tables: Set<number>,
): boolean {
  let offset = segment.payloadOffset;
  while (offset < segment.end) {
    const specification = bytes[offset];
    if (specification === undefined) {
      return false;
    }
    const precision = specification >> 4;
    const identifier = specification & 0x0f;
    if (precision > 1 || identifier > 3) {
      return false;
    }

    const tableBytes = precision === 0 ? 64 : 128;
    offset += 1 + tableBytes;
    if (offset > segment.end) {
      return false;
    }
    tables.add(identifier);
  }
  return offset === segment.end;
}

function parseJpegHuffmanTables(
  bytes: Uint8Array,
  segment: JpegSegment,
  tables: Set<string>,
): boolean {
  let offset = segment.payloadOffset;
  while (offset < segment.end) {
    if (offset + 17 > segment.end) {
      return false;
    }

    const specification = bytes[offset] ?? 0xff;
    const tableClass = specification >> 4;
    const identifier = specification & 0x0f;
    if (tableClass > 1 || identifier > 3) {
      return false;
    }

    let symbolCount = 0;
    for (let index = 1; index <= 16; index += 1) {
      symbolCount += bytes[offset + index] ?? 0;
    }
    if (symbolCount === 0 || symbolCount > 256) {
      return false;
    }

    offset += 17 + symbolCount;
    if (offset > segment.end) {
      return false;
    }
    tables.add(`${tableClass}:${identifier}`);
  }
  return offset === segment.end;
}

function parseJpegFrame(
  bytes: Uint8Array,
  segment: JpegSegment,
  marker: number,
): JpegFrame | null {
  if (segment.payloadLength < 9 || bytes[segment.payloadOffset] !== 8) {
    return null;
  }

  const height = readUint16(bytes, segment.payloadOffset + 1);
  const width = readUint16(bytes, segment.payloadOffset + 3);
  const componentCount = bytes[segment.payloadOffset + 5] ?? 0;
  if (
    height === 0 ||
    width === 0 ||
    width * height > MAX_IMAGE_PIXELS ||
    componentCount < 1 ||
    componentCount > 4 ||
    segment.payloadLength !== 6 + 3 * componentCount
  ) {
    return null;
  }

  const componentQuantizationTables = new Map<number, number>();
  for (let index = 0; index < componentCount; index += 1) {
    const componentOffset = segment.payloadOffset + 6 + index * 3;
    const identifier = bytes[componentOffset] ?? 0;
    const sampling = bytes[componentOffset + 1] ?? 0;
    const horizontalSampling = sampling >> 4;
    const verticalSampling = sampling & 0x0f;
    const quantizationTable = bytes[componentOffset + 2] ?? 0xff;
    if (
      componentQuantizationTables.has(identifier) ||
      horizontalSampling < 1 ||
      horizontalSampling > 4 ||
      verticalSampling < 1 ||
      verticalSampling > 4 ||
      quantizationTable > 3
    ) {
      return null;
    }
    componentQuantizationTables.set(identifier, quantizationTable);
  }

  return {
    componentQuantizationTables,
    progressive: marker === 0xc2,
  };
}

function hasValidJpegScanHeader(
  bytes: Uint8Array,
  segment: JpegSegment,
  frame: JpegFrame,
  quantizationTables: ReadonlySet<number>,
  huffmanTables: ReadonlySet<string>,
): boolean {
  if (segment.payloadLength < 6) {
    return false;
  }

  const componentCount = bytes[segment.payloadOffset] ?? 0;
  if (
    componentCount < 1 ||
    componentCount > frame.componentQuantizationTables.size ||
    segment.payloadLength !== 4 + 2 * componentCount
  ) {
    return false;
  }

  const spectralOffset = segment.payloadOffset + 1 + 2 * componentCount;
  const spectralStart = bytes[spectralOffset] ?? 0xff;
  const spectralEnd = bytes[spectralOffset + 1] ?? 0xff;
  const approximation = bytes[spectralOffset + 2] ?? 0xff;
  const approximationHigh = approximation >> 4;
  const approximationLow = approximation & 0x0f;

  if (frame.progressive) {
    if (
      spectralStart > spectralEnd ||
      spectralEnd > 63 ||
      (spectralStart === 0 && spectralEnd !== 0) ||
      (spectralStart > 0 && componentCount !== 1) ||
      approximationHigh > 13 ||
      approximationLow > 13 ||
      (approximationHigh > 0 && approximationHigh !== approximationLow + 1)
    ) {
      return false;
    }
  } else if (
    spectralStart !== 0 ||
    spectralEnd !== 63 ||
    approximation !== 0
  ) {
    return false;
  }

  const scanComponents = new Set<number>();
  for (let index = 0; index < componentCount; index += 1) {
    const componentOffset = segment.payloadOffset + 1 + index * 2;
    const identifier = bytes[componentOffset] ?? 0;
    const selectors = bytes[componentOffset + 1] ?? 0xff;
    const dcTable = selectors >> 4;
    const acTable = selectors & 0x0f;
    const quantizationTable = frame.componentQuantizationTables.get(identifier);
    if (
      quantizationTable === undefined ||
      !quantizationTables.has(quantizationTable) ||
      scanComponents.has(identifier) ||
      dcTable > 3 ||
      acTable > 3
    ) {
      return false;
    }

    const requiresDc = !frame.progressive || spectralStart === 0;
    const requiresAc = !frame.progressive || spectralStart > 0;
    if (
      (requiresDc && !huffmanTables.has(`0:${dcTable}`)) ||
      (requiresAc && !huffmanTables.has(`1:${acTable}`))
    ) {
      return false;
    }
    scanComponents.add(identifier);
  }

  return true;
}

function nextJpegScanMarker(bytes: Uint8Array, offset: number): number | null {
  let observedEntropy = false;
  let cursor = offset;

  while (cursor < bytes.byteLength) {
    if (bytes[cursor] !== 0xff) {
      observedEntropy = true;
      cursor += 1;
      continue;
    }

    const markerStart = cursor;
    cursor += 1;
    while (cursor < bytes.byteLength && bytes[cursor] === 0xff) {
      cursor += 1;
    }

    const code = bytes[cursor];
    if (code === undefined) {
      return null;
    }
    if (code === 0x00) {
      observedEntropy = true;
      cursor += 1;
      continue;
    }
    if (code >= 0xd0 && code <= 0xd7) {
      cursor += 1;
      continue;
    }
    return observedEntropy ? markerStart : null;
  }

  return null;
}

function hasValidJpegStructure(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 14 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }

  const quantizationTables = new Set<number>();
  const huffmanTables = new Set<string>();
  let offset = 2;
  let frame: JpegFrame | null = null;
  let foundScan = false;

  while (offset < bytes.byteLength) {
    const marker = readJpegMarker(bytes, offset);
    if (marker === null || marker.code === 0xd8) {
      return false;
    }
    if (marker.code === 0xd9) {
      return frame !== null && foundScan && marker.nextOffset === bytes.byteLength;
    }

    const segment = readJpegSegment(bytes, marker.nextOffset);
    if (segment === null) {
      return false;
    }

    if (marker.code === 0xdb) {
      if (!parseJpegQuantizationTables(bytes, segment, quantizationTables)) {
        return false;
      }
    } else if (marker.code === 0xc4) {
      if (!parseJpegHuffmanTables(bytes, segment, huffmanTables)) {
        return false;
      }
    } else if (JPEG_FRAME_MARKERS.has(marker.code)) {
      if (
        frame !== null ||
        !JPEG_SUPPORTED_FRAMES.has(marker.code)
      ) {
        return false;
      }
      frame = parseJpegFrame(bytes, segment, marker.code);
      if (frame === null) {
        return false;
      }
    } else if (marker.code === 0xda) {
      if (
        frame === null ||
        !hasValidJpegScanHeader(
          bytes,
          segment,
          frame,
          quantizationTables,
          huffmanTables,
        )
      ) {
        return false;
      }
      foundScan = true;
      const nextMarker = nextJpegScanMarker(bytes, segment.end);
      if (nextMarker === null) {
        return false;
      }
      offset = nextMarker;
      continue;
    } else if (marker.code === 0xdd) {
      if (segment.payloadLength !== 2) {
        return false;
      }
    } else if (
      !(
        (marker.code >= 0xe0 && marker.code <= 0xef) ||
        marker.code === 0xfe
      )
    ) {
      return false;
    }

    offset = segment.end;
  }

  return false;
}

const MAX_PDF_DICTIONARY_BYTES = 256 * 1024;
const MAX_PDF_XREF_DECODED_BYTES = 10 * 1024 * 1024;
const MAX_PDF_XREF_ENTRIES = 100_000;

function isPdfWhitespace(value: number | undefined): boolean {
  return (
    value === 0x00 ||
    value === 0x09 ||
    value === 0x0a ||
    value === 0x0c ||
    value === 0x0d ||
    value === 0x20
  );
}

function skipPdfWhitespace(source: string, offset: number): number {
  let cursor = offset;
  while (cursor < source.length && isPdfWhitespace(source.charCodeAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

interface PdfDictionarySlice {
  end: number;
  source: string;
}

function readPdfDictionary(
  source: string,
  offset: number,
): PdfDictionarySlice | null {
  if (source.slice(offset, offset + 2) !== "<<") {
    return null;
  }

  let cursor = offset;
  let depth = 0;
  while (cursor < source.length) {
    const current = source[cursor];
    const next = source[cursor + 1];

    if (current === "%") {
      cursor += 1;
      while (
        cursor < source.length &&
        source[cursor] !== "\n" &&
        source[cursor] !== "\r"
      ) {
        cursor += 1;
      }
      continue;
    }

    if (current === "(") {
      let stringDepth = 1;
      cursor += 1;
      while (cursor < source.length && stringDepth > 0) {
        if (source[cursor] === "\\") {
          cursor += 2;
        } else {
          if (source[cursor] === "(") {
            stringDepth += 1;
          } else if (source[cursor] === ")") {
            stringDepth -= 1;
          }
          cursor += 1;
        }
      }
      if (stringDepth !== 0) {
        return null;
      }
      continue;
    }

    if (current === "<" && next !== "<") {
      cursor += 1;
      while (cursor < source.length && source[cursor] !== ">") {
        cursor += 1;
      }
      if (cursor >= source.length) {
        return null;
      }
      cursor += 1;
      continue;
    }

    if (current === "<" && next === "<") {
      depth += 1;
      cursor += 2;
      continue;
    }

    if (current === ">" && next === ">") {
      depth -= 1;
      cursor += 2;
      if (depth === 0) {
        const dictionarySource = source.slice(offset, cursor);
        return dictionarySource.length <= MAX_PDF_DICTIONARY_BYTES
          ? { end: cursor, source: dictionarySource }
          : null;
      }
      if (depth < 0) {
        return null;
      }
      continue;
    }

    cursor += 1;
  }

  return null;
}

function maskPdfStringsAndComments(source: string): string {
  const result = Array.from(source);
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] === "%") {
      while (
        cursor < source.length &&
        source[cursor] !== "\n" &&
        source[cursor] !== "\r"
      ) {
        result[cursor] = " ";
        cursor += 1;
      }
      continue;
    }

    if (source[cursor] === "(") {
      let depth = 1;
      result[cursor] = " ";
      cursor += 1;
      while (cursor < source.length && depth > 0) {
        result[cursor] = " ";
        if (source[cursor] === "\\") {
          cursor += 1;
          if (cursor < source.length) {
            result[cursor] = " ";
          }
        } else if (source[cursor] === "(") {
          depth += 1;
        } else if (source[cursor] === ")") {
          depth -= 1;
        }
        cursor += 1;
      }
      continue;
    }

    if (source[cursor] === "<" && source[cursor + 1] === "<") {
      cursor += 2;
      continue;
    }

    if (source[cursor] === "<" && source[cursor + 1] !== "<") {
      result[cursor] = " ";
      cursor += 1;
      while (cursor < source.length) {
        result[cursor] = " ";
        if (source[cursor] === ">") {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      continue;
    }

    cursor += 1;
  }

  return result.join("");
}

function hasIndirectObjectHeader(
  bytes: Uint8Array,
  offset: number,
  objectNumber: number,
  generation: number,
  upperBound: number,
): boolean {
  if (
    offset < PDF_HEADER.byteLength ||
    offset >= upperBound ||
    upperBound > bytes.byteLength
  ) {
    return false;
  }

  const source = ascii(bytes, offset, Math.min(80, upperBound - offset));
  const pattern = new RegExp(
    "^" +
      objectNumber +
      "[\\u0000\\u0009\\u000a\\u000c\\u000d\\u0020]+" +
      generation +
      "[\\u0000\\u0009\\u000a\\u000c\\u000d\\u0020]+obj" +
      "(?=[\\u0000\\u0009\\u000a\\u000c\\u000d\\u0020<\\[\\/(%]|$)",
    "u",
  );
  return pattern.test(source);
}

function hasCatalogObjectAt(
  bytes: Uint8Array,
  offset: number,
  objectNumber: number,
  generation: number,
  upperBound: number,
): boolean {
  if (
    !hasIndirectObjectHeader(
      bytes,
      offset,
      objectNumber,
      generation,
      upperBound,
    )
  ) {
    return false;
  }

  const source = ascii(bytes, offset, upperBound - offset);
  const header = new RegExp(
    "^" +
      objectNumber +
      "[\\u0000\\u0009\\u000a\\u000c\\u000d\\u0020]+" +
      generation +
      "[\\u0000\\u0009\\u000a\\u000c\\u000d\\u0020]+obj",
    "u",
  ).exec(source);
  if (header === null) {
    return false;
  }

  const dictionaryStart = skipPdfWhitespace(source, header[0].length);
  const dictionary = readPdfDictionary(source, dictionaryStart);
  if (dictionary === null) {
    return false;
  }

  const afterDictionary = skipPdfWhitespace(source, dictionary.end);
  if (
    source.slice(afterDictionary, afterDictionary + 6) !== "endobj" ||
    (afterDictionary + 6 < source.length &&
      !isPdfWhitespace(source.charCodeAt(afterDictionary + 6)))
  ) {
    return false;
  }

  const tokens = maskPdfStringsAndComments(dictionary.source);
  const catalogTypes = Array.from(
    tokens.matchAll(
      /\/Type(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+\/Catalog\b/gu,
    ),
  );
  const pageReferences = Array.from(
    tokens.matchAll(
      /\/Pages(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+[0-9]+[\u0000\u0009\u000a\u000c\u000d\u0020]+[0-9]+[\u0000\u0009\u000a\u000c\u000d\u0020]+R\b/gu,
    ),
  );
  return catalogTypes.length === 1 && pageReferences.length === 1;
}

interface ClassicPdfXrefEntry {
  generation: number;
  inUse: boolean;
  offset: number;
}

interface PdfIndirectReference {
  generation: number;
  objectNumber: number;
}

function getIndirectObjectStructuralSource(
  bytes: Uint8Array,
  entry: ClassicPdfXrefEntry,
  objectNumber: number,
  upperBound: number,
): string | null {
  if (
    !hasIndirectObjectHeader(
      bytes,
      entry.offset,
      objectNumber,
      entry.generation,
      upperBound,
    )
  ) {
    return null;
  }

  const source = ascii(bytes, entry.offset, upperBound - entry.offset);
  const header = new RegExp(
    "^" +
      objectNumber +
      "[\\u0000\\u0009\\u000a\\u000c\\u000d\\u0020]+" +
      entry.generation +
      "[\\u0000\\u0009\\u000a\\u000c\\u000d\\u0020]+obj",
    "u",
  ).exec(source);
  if (header === null) {
    return null;
  }

  const bodyStart = skipPdfWhitespace(source, header[0].length);
  if (source.slice(bodyStart, bodyStart + 2) === "<<") {
    return readPdfDictionary(source, bodyStart)?.source ?? null;
  }

  const masked = maskPdfStringsAndComments(source);
  const endObject = /(?:^|[\u0000\u0009\u000a\u000c\u000d\u0020])endobj(?=[\u0000\u0009\u000a\u000c\u000d\u0020]|$)/u.exec(
    masked.slice(bodyStart),
  );
  if (endObject === null) {
    return null;
  }

  return source.slice(bodyStart, bodyStart + endObject.index);
}

interface ClassicPdfStructuralIndex {
  readonly maximumScannedBytes: number;
  readonly structuralSources: Map<number, string | null>;
  readonly upperBounds: ReadonlyMap<number, number>;
  scannedBytes: number;
}

function buildClassicPdfStructuralIndex(
  entries: ReadonlyMap<number, ClassicPdfXrefEntry>,
  xrefOffset: number,
): ClassicPdfStructuralIndex | null {
  const liveEntries = Array.from(entries.entries())
    .filter(([, entry]) => entry.inUse)
    .sort((left, right) => left[1].offset - right[1].offset);
  if (liveEntries.length === 0) {
    return null;
  }

  const upperBounds = new Map<number, number>();
  for (let index = 0; index < liveEntries.length; index += 1) {
    const current = liveEntries[index];
    const next = liveEntries[index + 1];
    if (current === undefined) {
      return null;
    }

    const [objectNumber, entry] = current;
    const upperBound = next?.[1].offset ?? xrefOffset;
    if (
      entry.offset < PDF_HEADER.byteLength ||
      entry.offset >= xrefOffset ||
      upperBound <= entry.offset ||
      upperBound > xrefOffset
    ) {
      return null;
    }
    upperBounds.set(objectNumber, upperBound);
  }

  return {
    maximumScannedBytes: xrefOffset,
    scannedBytes: 0,
    structuralSources: new Map<number, string | null>(),
    upperBounds,
  };
}

function getIndexedIndirectObjectStructuralSource(
  bytes: Uint8Array,
  entries: ReadonlyMap<number, ClassicPdfXrefEntry>,
  objectNumber: number,
  index: ClassicPdfStructuralIndex,
): string | null {
  if (index.structuralSources.has(objectNumber)) {
    return index.structuralSources.get(objectNumber) ?? null;
  }

  const entry = entries.get(objectNumber);
  const upperBound = index.upperBounds.get(objectNumber);
  if (entry === undefined || !entry.inUse || upperBound === undefined) {
    index.structuralSources.set(objectNumber, null);
    return null;
  }

  const scanBytes = upperBound - entry.offset;
  if (
    scanBytes <= 0 ||
    !Number.isSafeInteger(index.scannedBytes + scanBytes) ||
    index.scannedBytes + scanBytes > index.maximumScannedBytes
  ) {
    index.structuralSources.set(objectNumber, null);
    return null;
  }
  index.scannedBytes += scanBytes;

  const structuralSource = getIndirectObjectStructuralSource(
    bytes,
    entry,
    objectNumber,
    upperBound,
  );
  index.structuralSources.set(objectNumber, structuralSource);
  return structuralSource;
}

function extractPdfIndirectReferences(
  structuralSource: string,
): PdfIndirectReference[] | null {
  const tokens = maskPdfStringsAndComments(structuralSource);
  const references: PdfIndirectReference[] = [];

  for (const match of tokens.matchAll(
    /([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+R\b/gu,
  )) {
    const objectText = match[1];
    const generationText = match[2];
    if (objectText === undefined || generationText === undefined) {
      return null;
    }

    const objectNumber = Number(objectText);
    const generation = Number(generationText);
    if (
      !Number.isSafeInteger(objectNumber) ||
      !Number.isSafeInteger(generation) ||
      objectNumber < 0 ||
      generation < 0 ||
      generation > 65_535
    ) {
      return null;
    }
    references.push({ generation, objectNumber });
  }

  return references;
}

function hasCompleteClassicReferenceGraph(
  bytes: Uint8Array,
  entries: ReadonlyMap<number, ClassicPdfXrefEntry>,
  structuralIndex: ClassicPdfStructuralIndex,
  trailerTokens: string,
  rootObject: number,
  rootGeneration: number,
): boolean {
  const rootEntry = entries.get(rootObject);
  if (
    rootEntry === undefined ||
    !rootEntry.inUse ||
    rootEntry.generation !== rootGeneration
  ) {
    return false;
  }

  const catalogSource = getIndexedIndirectObjectStructuralSource(
    bytes,
    entries,
    rootObject,
    structuralIndex,
  );
  if (catalogSource === null) {
    return false;
  }

  const catalogTokens = maskPdfStringsAndComments(catalogSource);
  const catalogTypes = Array.from(
    catalogTokens.matchAll(
      /\/Type(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+\/Catalog\b/gu,
    ),
  );
  const pageTreeReferences = Array.from(
    catalogTokens.matchAll(
      /\/Pages(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+R\b/gu,
    ),
  );
  const pageTreeObjectText = pageTreeReferences[0]?.[1];
  const pageTreeGenerationText = pageTreeReferences[0]?.[2];
  if (
    catalogTypes.length !== 1 ||
    pageTreeReferences.length !== 1 ||
    pageTreeObjectText === undefined ||
    pageTreeGenerationText === undefined
  ) {
    return false;
  }

  const pageTreeObject = Number(pageTreeObjectText);
  const pageTreeGeneration = Number(pageTreeGenerationText);
  const pageTreeEntry = entries.get(pageTreeObject);
  if (
    !Number.isSafeInteger(pageTreeObject) ||
    !Number.isSafeInteger(pageTreeGeneration) ||
    pageTreeEntry === undefined ||
    !pageTreeEntry.inUse ||
    pageTreeEntry.generation !== pageTreeGeneration
  ) {
    return false;
  }

  const pageTreeSource = getIndexedIndirectObjectStructuralSource(
    bytes,
    entries,
    pageTreeObject,
    structuralIndex,
  );
  if (pageTreeSource === null) {
    return false;
  }

  const pageTreeTokens = maskPdfStringsAndComments(pageTreeSource);
  if (
    Array.from(
      pageTreeTokens.matchAll(
        /\/Type(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+\/Pages\b/gu,
      ),
    ).length !== 1 ||
    Array.from(
      pageTreeTokens.matchAll(
        /\/Kids(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]*\[/gu,
      ),
    ).length !== 1 ||
    Array.from(
      pageTreeTokens.matchAll(
        /\/Count(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+[0-9]+\b/gu,
      ),
    ).length !== 1
  ) {
    return false;
  }

  const trailerReferences = extractPdfIndirectReferences(trailerTokens);
  if (trailerReferences === null) {
    return false;
  }

  const pending = [...trailerReferences];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const reference = pending.pop();
    if (reference === undefined) {
      return false;
    }

    const key = reference.objectNumber + ":" + reference.generation;
    if (visited.has(key)) {
      continue;
    }
    if (visited.size >= MAX_PDF_XREF_ENTRIES) {
      return false;
    }
    visited.add(key);

    const entry = entries.get(reference.objectNumber);
    if (
      entry === undefined ||
      !entry.inUse ||
      entry.generation !== reference.generation
    ) {
      return false;
    }

    const structuralSource = getIndexedIndirectObjectStructuralSource(
      bytes,
      entries,
      reference.objectNumber,
      structuralIndex,
    );
    if (structuralSource === null) {
      return false;
    }

    const references = extractPdfIndirectReferences(structuralSource);
    if (references === null) {
      return false;
    }
    for (const childReference of references) {
      if (pending.length >= MAX_PDF_XREF_ENTRIES) {
        return false;
      }
      pending.push(childReference);
    }
  }

  return visited.has(rootObject + ":" + rootGeneration);
}

function hasValidClassicPdfXref(
  bytes: Uint8Array,
  xrefOffset: number,
  absoluteStartXref: number,
): boolean {
  const source = ascii(
    bytes,
    xrefOffset,
    absoluteStartXref - xrefOffset,
  );
  const prefix = /^xref[ \t]*(?:\r\n|\r|\n)/u.exec(source);
  if (prefix === null) {
    return false;
  }

  const entries = new Map<number, ClassicPdfXrefEntry>();
  let cursor = prefix[0].length;
  let foundSubsection = false;
  let foundInUseEntry = false;
  let maximumObject = -1;

  while (true) {
    cursor = skipPdfWhitespace(source, cursor);
    if (source.slice(cursor, cursor + 7) === "trailer") {
      break;
    }

    const subsection = /^([0-9]+)[ \t]+([0-9]+)[ \t]*(?:\r\n|\r|\n)/u.exec(
      source.slice(cursor),
    );
    const firstText = subsection?.[1];
    const countText = subsection?.[2];
    if (
      subsection === null ||
      firstText === undefined ||
      countText === undefined
    ) {
      return false;
    }

    const first = Number(firstText);
    const count = Number(countText);
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(count) ||
      first < 0 ||
      count <= 0 ||
      !Number.isSafeInteger(first + count) ||
      count > Math.floor(source.length / 18) ||
      entries.size + count > MAX_PDF_XREF_ENTRIES
    ) {
      return false;
    }
    cursor += subsection[0].length;
    foundSubsection = true;

    for (let index = 0; index < count; index += 1) {
      const entry = /^([0-9]{10})[ \t]+([0-9]{5})[ \t]+([nf])[ \t]*(?:\r\n|\r|\n)/u.exec(
        source.slice(cursor),
      );
      const offsetText = entry?.[1];
      const generationText = entry?.[2];
      const state = entry?.[3];
      if (
        entry === null ||
        offsetText === undefined ||
        generationText === undefined ||
        state === undefined
      ) {
        return false;
      }

      const objectNumber = first + index;
      const objectOffset = Number(offsetText);
      const generation = Number(generationText);
      if (
        entries.has(objectNumber) ||
        !Number.isSafeInteger(objectOffset) ||
        !Number.isSafeInteger(generation)
      ) {
        return false;
      }

      const inUse = state === "n";
      if (
        inUse &&
        !hasIndirectObjectHeader(
          bytes,
          objectOffset,
          objectNumber,
          generation,
          xrefOffset,
        )
      ) {
        return false;
      }

      entries.set(objectNumber, {
        generation,
        inUse,
        offset: objectOffset,
      });
      maximumObject = Math.max(maximumObject, objectNumber);
      foundInUseEntry ||= inUse;
      cursor += entry[0].length;
    }
  }

  if (!foundSubsection || !foundInUseEntry) {
    return false;
  }

  cursor += 7;
  cursor = skipPdfWhitespace(source, cursor);
  const trailer = readPdfDictionary(source, cursor);
  if (trailer === null || skipPdfWhitespace(source, trailer.end) !== source.length) {
    return false;
  }

  const tokens = maskPdfStringsAndComments(trailer.source);
  if (
    /\/Encrypt\b/u.test(tokens) ||
    /\/Prev\b/u.test(tokens) ||
    /\/XRefStm\b/u.test(tokens)
  ) {
    return false;
  }

  const roots = Array.from(
    tokens.matchAll(
      /\/Root(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+R\b/gu,
    ),
  );
  const sizes = Array.from(
    tokens.matchAll(
      /\/Size(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)\b/gu,
    ),
  );
  const rootObjectText = roots[0]?.[1];
  const rootGenerationText = roots[0]?.[2];
  const sizeText = sizes[0]?.[1];
  if (
    roots.length !== 1 ||
    sizes.length !== 1 ||
    rootObjectText === undefined ||
    rootGenerationText === undefined ||
    sizeText === undefined
  ) {
    return false;
  }

  const rootObject = Number(rootObjectText);
  const rootGeneration = Number(rootGenerationText);
  const size = Number(sizeText);
  const rootEntry = entries.get(rootObject);
  const structuralIndex = buildClassicPdfStructuralIndex(entries, xrefOffset);
  if (structuralIndex === null) {
    return false;
  }
  return (
    Number.isSafeInteger(rootObject) &&
    Number.isSafeInteger(rootGeneration) &&
    Number.isSafeInteger(size) &&
    size > maximumObject &&
    rootEntry !== undefined &&
    rootEntry.inUse &&
    rootEntry.generation === rootGeneration &&
    hasCompleteClassicReferenceGraph(
      bytes,
      entries,
      structuralIndex,
      tokens,
      rootObject,
      rootGeneration,
    )
  );
}

function readPdfXrefField(
  bytes: Uint8Array,
  offset: number,
  width: number,
): number | null {
  let value = 0;
  for (let index = 0; index < width; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
    if (!Number.isSafeInteger(value)) {
      return null;
    }
  }
  return value;
}

interface PdfXrefStreamRecord {
  field2: number;
  field3: number;
  type: number;
}

function hasValidPdfXrefStream(
  bytes: Uint8Array,
  xrefOffset: number,
  absoluteStartXref: number,
): boolean {
  const source = ascii(
    bytes,
    xrefOffset,
    absoluteStartXref - xrefOffset,
  );
  const header = /^([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+obj(?=[\u0000\u0009\u000a\u000c\u000d\u0020<])/u.exec(
    source,
  );
  const xrefObjectText = header?.[1];
  const xrefGenerationText = header?.[2];
  if (
    header === null ||
    xrefObjectText === undefined ||
    xrefGenerationText === undefined
  ) {
    return false;
  }

  const xrefObject = Number(xrefObjectText);
  const xrefGeneration = Number(xrefGenerationText);
  if (
    !Number.isSafeInteger(xrefObject) ||
    !Number.isSafeInteger(xrefGeneration)
  ) {
    return false;
  }

  const dictionaryStart = skipPdfWhitespace(source, header[0].length);
  const dictionary = readPdfDictionary(source, dictionaryStart);
  if (dictionary === null) {
    return false;
  }

  const tokens = maskPdfStringsAndComments(dictionary.source);
  const types = Array.from(
    tokens.matchAll(
      /\/Type(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+\/XRef\b/gu,
    ),
  );
  const roots = Array.from(
    tokens.matchAll(
      /\/Root(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+R\b/gu,
    ),
  );
  const sizes = Array.from(
    tokens.matchAll(
      /\/Size(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)\b/gu,
    ),
  );
  const lengths = Array.from(
    tokens.matchAll(
      /\/Length(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)\b/gu,
    ),
  );
  const widths = Array.from(
    tokens.matchAll(
      /\/W(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]*\[[\u0000\u0009\u000a\u000c\u000d\u0020]*([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]*\]/gu,
    ),
  );
  const rootObjectText = roots[0]?.[1];
  const rootGenerationText = roots[0]?.[2];
  const sizeText = sizes[0]?.[1];
  const lengthText = lengths[0]?.[1];
  const widthTexts = widths[0]?.slice(1, 4);
  if (
    types.length !== 1 ||
    roots.length !== 1 ||
    sizes.length !== 1 ||
    lengths.length !== 1 ||
    widths.length !== 1 ||
    rootObjectText === undefined ||
    rootGenerationText === undefined ||
    sizeText === undefined ||
    lengthText === undefined ||
    widthTexts === undefined
  ) {
    return false;
  }

  const rootObject = Number(rootObjectText);
  const rootGeneration = Number(rootGenerationText);
  const size = Number(sizeText);
  const streamLength = Number(lengthText);
  const fieldWidths = widthTexts.map(Number);
  if (
    !Number.isSafeInteger(rootObject) ||
    !Number.isSafeInteger(rootGeneration) ||
    !Number.isSafeInteger(size) ||
    !Number.isSafeInteger(streamLength) ||
    size <= Math.max(rootObject, xrefObject) ||
    streamLength <= 0 ||
    fieldWidths.length !== 3 ||
    fieldWidths.some(
      (width) => !Number.isSafeInteger(width) || width < 0 || width > 8,
    )
  ) {
    return false;
  }

  const recordWidth = fieldWidths.reduce((total, width) => total + width, 0);
  if (recordWidth <= 0) {
    return false;
  }

  const indexMatches = Array.from(
    tokens.matchAll(
      /\/Index(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]*\[([\u0000\u0009\u000a\u000c\u000d\u00200-9]+)\]/gu,
    ),
  );
  const indexValues =
    indexMatches.length === 0
      ? [0, size]
      : indexMatches.length === 1
        ? (indexMatches[0]?.[1] ?? "")
            .trim()
            .split(/[\u0000\u0009\u000a\u000c\u000d\u0020]+/u)
            .filter((value) => value.length > 0)
            .map(Number)
        : [];
  if (indexValues.length === 0 || indexValues.length % 2 !== 0) {
    return false;
  }

  let entryCount = 0;
  const ranges: Array<readonly [number, number]> = [];
  for (let index = 0; index < indexValues.length; index += 2) {
    const first = indexValues[index];
    const count = indexValues[index + 1];
    if (
      first === undefined ||
      count === undefined ||
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(count) ||
      first < 0 ||
      count <= 0 ||
      first + count > size ||
      !Number.isSafeInteger(entryCount + count) ||
      entryCount + count > MAX_PDF_XREF_ENTRIES
    ) {
      return false;
    }
    ranges.push([first, count]);
    entryCount += count;
  }

  const expectedDecodedLength = entryCount * recordWidth;
  if (
    !Number.isSafeInteger(expectedDecodedLength) ||
    expectedDecodedLength <= 0 ||
    expectedDecodedLength > MAX_PDF_XREF_DECODED_BYTES
  ) {
    return false;
  }

  let cursor = skipPdfWhitespace(source, dictionary.end);
  if (source.slice(cursor, cursor + 6) !== "stream") {
    return false;
  }
  cursor += 6;
  if (source.slice(cursor, cursor + 2) === "\r\n") {
    cursor += 2;
  } else if (source[cursor] === "\r" || source[cursor] === "\n") {
    cursor += 1;
  } else {
    return false;
  }

  const dataStart = cursor;
  const dataEnd = dataStart + streamLength;
  if (dataEnd > source.length) {
    return false;
  }
  cursor = dataEnd;
  if (source.slice(cursor, cursor + 2) === "\r\n") {
    cursor += 2;
  } else if (source[cursor] === "\r" || source[cursor] === "\n") {
    cursor += 1;
  }
  if (source.slice(cursor, cursor + 9) !== "endstream") {
    return false;
  }
  cursor = skipPdfWhitespace(source, cursor + 9);
  if (source.slice(cursor, cursor + 6) !== "endobj") {
    return false;
  }
  cursor = skipPdfWhitespace(source, cursor + 6);
  if (cursor !== source.length) {
    return false;
  }

  const filters = Array.from(
    tokens.matchAll(
      /\/Filter(?=[\u0000\u0009\u000a\u000c\u000d\u0020])/gu,
    ),
  );
  const usesFlate =
    filters.length === 1 &&
    /\/Filter(?=[\u0000\u0009\u000a\u000c\u000d\u0020])[\u0000\u0009\u000a\u000c\u000d\u0020]+\/FlateDecode\b/u.test(
      tokens,
    );
  if (filters.length > 1 || (filters.length === 1 && !usesFlate)) {
    return false;
  }

  const encoded = bytes.slice(
    xrefOffset + dataStart,
    xrefOffset + dataEnd,
  );
  let decoded: Uint8Array;
  try {
    decoded = usesFlate
      ? Uint8Array.from(
          inflateSync(encoded, {
            maxOutputLength: expectedDecodedLength,
          }),
        )
      : encoded;
  } catch {
    return false;
  }
  if (decoded.byteLength !== expectedDecodedLength) {
    return false;
  }

  const records = new Map<number, PdfXrefStreamRecord>();
  let recordOffset = 0;
  for (const [first, count] of ranges) {
    for (let index = 0; index < count; index += 1) {
      const type =
        fieldWidths[0] === 0
          ? 1
          : readPdfXrefField(decoded, recordOffset, fieldWidths[0] ?? 0);
      const field2 = readPdfXrefField(
        decoded,
        recordOffset + (fieldWidths[0] ?? 0),
        fieldWidths[1] ?? 0,
      );
      const field3 = readPdfXrefField(
        decoded,
        recordOffset + (fieldWidths[0] ?? 0) + (fieldWidths[1] ?? 0),
        fieldWidths[2] ?? 0,
      );
      if (
        type === null ||
        field2 === null ||
        field3 === null ||
        type < 0 ||
        type > 2
      ) {
        return false;
      }

      const objectNumber = first + index;
      if (records.has(objectNumber)) {
        return false;
      }
      records.set(objectNumber, { field2, field3, type });
      recordOffset += recordWidth;
    }
  }

  const selfRecord = records.get(xrefObject);
  const rootRecord = records.get(rootObject);
  if (
    selfRecord?.type !== 1 ||
    selfRecord.field2 !== xrefOffset ||
    selfRecord.field3 !== xrefGeneration ||
    rootRecord === undefined ||
    rootRecord.type === 0 ||
    (rootRecord.type === 1 && rootRecord.field3 !== rootGeneration) ||
    (rootRecord.type === 2 && rootGeneration !== 0)
  ) {
    return false;
  }

  for (const [objectNumber, record] of records) {
    if (
      record.type === 1 &&
      !hasIndirectObjectHeader(
        bytes,
        record.field2,
        objectNumber,
        record.field3,
        absoluteStartXref,
      )
    ) {
      return false;
    }
    if (record.type === 2 && records.get(record.field2)?.type !== 1) {
      return false;
    }
  }

  return (
    rootRecord.type === 2 ||
    hasCatalogObjectAt(
      bytes,
      rootRecord.field2,
      rootObject,
      rootGeneration,
      xrefOffset,
    )
  );
}

function hasBoundedPdfStructure(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, PDF_HEADER) || bytes.byteLength < 32) {
    return false;
  }

  const version = ascii(bytes, PDF_HEADER.byteLength, 3);
  if (!/^(?:1\.[0-9]|2\.0)$/u.test(version) || !isPdfWhitespace(bytes[8])) {
    return false;
  }

  const tailStart = Math.max(0, bytes.byteLength - PDF_TAIL_SCAN_BYTES);
  const tail = ascii(bytes, tailStart, bytes.byteLength - tailStart);
  const match = /startxref[\u0000\u0009\u000a\u000c\u000d\u0020]+([0-9]+)[\u0000\u0009\u000a\u000c\u000d\u0020]+%%EOF[\u0000\u0009\u000a\u000c\u000d\u0020]*$/u.exec(
    tail,
  );
  const xrefText = match?.[1];
  if (match === null || xrefText === undefined) {
    return false;
  }

  const xrefOffset = Number(xrefText);
  const absoluteStartXref = tailStart + match.index;
  if (
    !Number.isSafeInteger(xrefOffset) ||
    xrefOffset <= 8 ||
    xrefOffset >= absoluteStartXref
  ) {
    return false;
  }

  const xrefRegion = ascii(
    bytes,
    xrefOffset,
    absoluteStartXref - xrefOffset,
  );
  if (/\/Encrypt\b/u.test(maskPdfStringsAndComments(xrefRegion))) {
    return false;
  }

  return /^xref[ \t]*(?:\r\n|\r|\n)/u.test(xrefRegion)
    ? hasValidClassicPdfXref(bytes, xrefOffset, absoluteStartXref)
    : hasValidPdfXrefStream(bytes, xrefOffset, absoluteStartXref);
}
async function hasValidImageContent(
  bytes: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<boolean> {
  const lightweightStructureIsValid =
    mimeType === "image/png"
      ? hasValidPngStructure(bytes)
      : hasValidJpegStructure(bytes);
  if (!lightweightStructureIsValid) {
    return false;
  }

  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
      unlimited: false,
    });
    const metadata = await image.metadata();
    const expectedFormat = mimeType === "image/png" ? "png" : "jpeg";
    if (
      metadata.format !== expectedFormat ||
      metadata.width === undefined ||
      metadata.height === undefined ||
      metadata.width <= 0 ||
      metadata.height <= 0 ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages !== undefined && metadata.pages !== 1)
    ) {
      return false;
    }

    const statistics = await image.stats();
    return (
      statistics.channels.length > 0 &&
      statistics.channels.every(
        (channel) =>
          Number.isFinite(channel.min) &&
          Number.isFinite(channel.max) &&
          Number.isFinite(channel.mean) &&
          Number.isFinite(channel.stdev),
      )
    );
  } catch {
    return false;
  }
}

async function hasValidPdfContent(bytes: Uint8Array): Promise<boolean> {
  try {
    if (!hasBoundedPdfStructure(bytes)) {
      return false;
    }

    const document = await PDFDocument.load(bytes, {
      capNumbers: true,
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    return !document.isEncrypted && document.getPages().length > 0;
  } catch {
    return false;
  }
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function hasDisallowedTextControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return true;
    }
    if (
      codePoint === 0 ||
      (codePoint < 0x20 &&
        codePoint !== 0x09 &&
        codePoint !== 0x0a &&
        codePoint !== 0x0d) ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x061c ||
      (codePoint >= 0x200b && codePoint <= 0x200f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}

async function hasValidContent(
  bytes: Uint8Array,
  mimeType: EvidenceMimeType,
): Promise<boolean> {
  switch (mimeType) {
    case "image/png":
    case "image/jpeg":
      return hasValidImageContent(bytes, mimeType);
    case "application/pdf":
      return hasValidPdfContent(bytes);
    case "application/json": {
      const decoded = decodeUtf8(bytes);
      if (decoded === null) {
        return false;
      }
      try {
        JSON.parse(decoded);
        return true;
      } catch {
        return false;
      }
    }
    case "text/plain":
    case "text/csv": {
      const decoded = decodeUtf8(bytes);
      return decoded !== null && !hasDisallowedTextControl(decoded);
    }
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  if (globalThis.crypto?.subtle === undefined) {
    return null;
  }
  try {
    const digestBytes = Uint8Array.from(bytes);
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      digestBytes,
    );
    return Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}

/**
 * Verifies untrusted upload metadata, bytes, declared type, and caller-provided
 * digest before a private evidence object can be persisted. Failure results do
 * not echo untrusted names, bytes, or hashes.
 */
export async function validatePrivateEvidenceUpload(
  input: unknown,
  maxBytes: unknown = MAX_EVIDENCE_UPLOAD_BYTES,
): Promise<PrivateUploadValidationResult> {
  const metadata = validateEvidenceUploadMetadata(input, maxBytes);
  if (!metadata.accepted) {
    return metadata;
  }

  const rawBytes = readProperty(input, "bytes");
  let stableBytes: Uint8Array;
  try {
    if (
      !isUint8Array(rawBytes) ||
      rawBytes.byteLength !== metadata.metadata.byteSize
    ) {
      return { accepted: false, code: "byte_size_mismatch" };
    }
    stableBytes = Uint8Array.from(rawBytes);
  } catch {
    return { accepted: false, code: "byte_size_mismatch" };
  }

  const expectedSha256Hex = readProperty(input, "expectedSha256Hex");
  if (
    typeof expectedSha256Hex !== "string" ||
    !SHA256_HEX.test(expectedSha256Hex)
  ) {
    return { accepted: false, code: "invalid_sha256" };
  }

  if (!(await hasValidContent(stableBytes, metadata.metadata.mimeType))) {
    return { accepted: false, code: "invalid_content" };
  }

  const digest = await sha256Hex(stableBytes);
  if (digest === null) {
    return { accepted: false, code: "hash_unavailable" };
  }
  if (digest !== expectedSha256Hex) {
    return { accepted: false, code: "sha256_mismatch" };
  }

  return {
    accepted: true,
    code: "accepted",
    upload: {
      byteSize: stableBytes.byteLength,
      fileName: metadata.metadata.fileName,
      mimeType: metadata.metadata.mimeType,
      sha256Hex: digest,
    },
  };
}
