import { createHash } from "node:crypto";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getEvidenceUploadMaxBytes,
  MAX_EVIDENCE_UPLOAD_BYTES,
} from "@/shared/auth/upload-policy";

import {
  type PrivateUploadValidationInput,
  validatePrivateEvidenceUpload,
} from "./private-upload-validation";

const encoder = new TextEncoder();
const PNG_SIGNATURE_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let validPng: Uint8Array;
let validBaselineJpeg: Uint8Array;
let validProgressiveJpeg: Uint8Array;
let validPdf: Uint8Array;
let validXrefStreamPdf: Uint8Array;
let emptyPdf: Uint8Array;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function input(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): PrivateUploadValidationInput {
  return {
    fileName,
    mimeType,
    bytes,
    byteSize: bytes.byteLength,
    expectedSha256Hex: digest(bytes),
  };
}

function concatenate(...parts: Uint8Array[]): Uint8Array {
  const byteLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
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

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
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

interface PngChunk {
  chunkOffset: number;
  crcOffset: number;
  dataOffset: number;
  end: number;
  length: number;
}

function findPngChunk(bytes: Uint8Array, expectedType: string): PngChunk {
  let offset = PNG_SIGNATURE_BYTES.byteLength;
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const end = crcOffset + 4;
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    if (type === expectedType) {
      return { chunkOffset: offset, crcOffset, dataOffset, end, length };
    }
    offset = end;
  }
  throw new Error(`PNG chunk not found: ${expectedType}`);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(12 + data.byteLength);
  writeUint32(result, 0, data.byteLength);
  result.set(encoder.encode(type), 4);
  result.set(data, 8);
  writeUint32(result, result.byteLength - 4, crc32(result, 4, result.byteLength - 4));
  return result;
}

function pngWithCorruptCrc(): Uint8Array {
  const result = Uint8Array.from(validPng);
  const chunk = findPngChunk(result, "IDAT");
  result[chunk.crcOffset] = (result[chunk.crcOffset] ?? 0) ^ 1;
  return result;
}

function pngWithInvalidIhdr(): Uint8Array {
  const result = Uint8Array.from(validPng);
  const chunk = findPngChunk(result, "IHDR");
  result[chunk.dataOffset + 10] = 1;
  writeUint32(
    result,
    chunk.crcOffset,
    crc32(result, chunk.chunkOffset + 4, chunk.crcOffset),
  );
  return result;
}

function pngWithExcessiveDimensions(): Uint8Array {
  const result = Uint8Array.from(validPng);
  const chunk = findPngChunk(result, "IHDR");
  writeUint32(result, chunk.dataOffset, 4097);
  writeUint32(result, chunk.dataOffset + 4, 4097);
  writeUint32(
    result,
    chunk.crcOffset,
    crc32(result, chunk.chunkOffset + 4, chunk.crcOffset),
  );
  return result;
}

function pngWithNonconsecutiveIdat(): Uint8Array {
  const ihdr = findPngChunk(validPng, "IHDR");
  const idat = findPngChunk(validPng, "IDAT");
  const iend = findPngChunk(validPng, "IEND");
  if (idat.length < 2) {
    throw new Error("PNG fixture needs splittable IDAT data");
  }
  const middle = Math.floor(idat.length / 2);
  const imageData = validPng.slice(idat.dataOffset, idat.crcOffset);
  return concatenate(
    PNG_SIGNATURE_BYTES,
    validPng.slice(ihdr.chunkOffset, ihdr.end),
    pngChunk("IDAT", imageData.slice(0, middle)),
    pngChunk("tEXt", encoder.encode("source\0test")),
    pngChunk("IDAT", imageData.slice(middle)),
    validPng.slice(iend.chunkOffset, iend.end),
  );
}

function pngWithEmptyIdat(): Uint8Array {
  const ihdr = findPngChunk(validPng, "IHDR");
  const iend = findPngChunk(validPng, "IEND");
  return concatenate(
    PNG_SIGNATURE_BYTES,
    validPng.slice(ihdr.chunkOffset, ihdr.end),
    pngChunk("IDAT", new Uint8Array()),
    validPng.slice(iend.chunkOffset, iend.end),
  );
}

function pngWithCorruptImageData(): Uint8Array {
  const result = Uint8Array.from(validPng);
  const chunk = findPngChunk(result, "IDAT");
  result[chunk.dataOffset] = (result[chunk.dataOffset] ?? 0) ^ 0xff;
  writeUint32(
    result,
    chunk.crcOffset,
    crc32(result, chunk.chunkOffset + 4, chunk.crcOffset),
  );
  return result;
}

interface JpegSegment {
  payloadOffset: number;
  end: number;
}

function findJpegSegment(bytes: Uint8Array, expectedMarker: number): JpegSegment {
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      throw new Error("Unexpected JPEG marker boundary");
    }
    let markerOffset = offset + 1;
    while (bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    const marker = bytes[markerOffset];
    if (marker === undefined || marker === 0xd9) {
      break;
    }
    const lengthOffset = markerOffset + 1;
    const length = readUint16(bytes, lengthOffset);
    const end = lengthOffset + length;
    if (marker === expectedMarker) {
      return { payloadOffset: lengthOffset + 2, end };
    }
    if (marker === 0xda) {
      break;
    }
    offset = end;
  }
  throw new Error(`JPEG marker not found: ${expectedMarker.toString(16)}`);
}

function jpegWithUndefinedQuantizationTable(): Uint8Array {
  const result = Uint8Array.from(validBaselineJpeg);
  const frame = findJpegSegment(result, 0xc0);
  result[frame.payloadOffset + 8] = 3;
  return result;
}

function jpegWithUndefinedHuffmanTables(): Uint8Array {
  const result = Uint8Array.from(validBaselineJpeg);
  const scan = findJpegSegment(result, 0xda);
  result[scan.payloadOffset + 2] = 0x33;
  return result;
}

function syntheticJpegWithoutTables(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
    0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x11,
    0xff, 0xd9,
  ]);
}

function pdfWithLeadingJunk(): Uint8Array {
  return concatenate(encoder.encode("junk\n"), validPdf);
}

function pdfWithTrailingJunk(): Uint8Array {
  return concatenate(validPdf, encoder.encode("junk"));
}

function pdfWithEncryptionDeclaration(): Uint8Array {
  const source = Buffer.from(validPdf).toString("latin1");
  const startXref = source.lastIndexOf("startxref");
  const trailerClose = source.lastIndexOf(">>", startXref);
  if (trailerClose < 0) {
    throw new Error("PDF trailer dictionary not found");
  }
  const altered =
    source.slice(0, trailerClose) +
    "/Encrypt 999 0 R\n" +
    source.slice(trailerClose);
  return Uint8Array.from(Buffer.from(altered, "latin1"));
}

function classicPdfStartXref(source: string): number {
  const match = /startxref\s+([0-9]+)\s+%%EOF\s*$/u.exec(source);
  const value = match?.[1];
  if (value === undefined) {
    throw new Error("Classic PDF startxref not found");
  }
  return Number(value);
}

function pdfWithStartXrefAtOrdinaryObject(): Uint8Array {
  const source = Buffer.from(validPdf).toString("latin1");
  const xrefOffset = classicPdfStartXref(source);
  const trailer = source.slice(xrefOffset);
  const root = /\/Root\s+([0-9]+)\s+([0-9]+)\s+R\b/u.exec(trailer);
  const objectNumber = root?.[1];
  const generation = root?.[2];
  if (objectNumber === undefined || generation === undefined) {
    throw new Error("Classic PDF root reference not found");
  }

  const objectOffset = source.indexOf(
    objectNumber + " " + generation + " obj",
  );
  if (objectOffset < 0) {
    throw new Error("Classic PDF root object not found");
  }

  const altered = source.replace(
    /startxref\s+[0-9]+(?=\s+%%EOF\s*$)/u,
    "startxref\n" + objectOffset,
  );
  return Uint8Array.from(Buffer.from(altered, "latin1"));
}

function pdfWithEmptyClassicXref(): Uint8Array {
  const source = Buffer.from(validPdf).toString("latin1");
  const xrefOffset = classicPdfStartXref(source);
  const trailerOffset = source.indexOf("trailer", xrefOffset);
  if (trailerOffset < 0) {
    throw new Error("Classic PDF trailer not found");
  }

  const altered =
    source.slice(0, xrefOffset) +
    "xref\n" +
    source.slice(trailerOffset);
  return Uint8Array.from(Buffer.from(altered, "latin1"));
}

function pdfWithSparseClassicXref(): Uint8Array {
  const source = Buffer.from(validPdf).toString("latin1");
  const xrefOffset = classicPdfStartXref(source);
  const trailer = source.slice(xrefOffset);
  const root = /\/Root\s+([0-9]+)\s+([0-9]+)\s+R\b/u.exec(trailer);
  const size = /\/Size\s+([0-9]+)\b/u.exec(trailer)?.[1];
  const rootObjectText = root?.[1];
  const rootGenerationText = root?.[2];
  if (
    rootObjectText === undefined ||
    rootGenerationText === undefined ||
    size === undefined
  ) {
    throw new Error("Classic PDF trailer metadata not found");
  }

  const rootOffset = source.indexOf(
    rootObjectText + " " + rootGenerationText + " obj",
  );
  if (rootOffset < 0) {
    throw new Error("Classic PDF root object not found");
  }

  const sparseXref =
    "xref\n" +
    "0 1\n" +
    "0000000000 65535 f \n" +
    rootObjectText +
    " 1\n" +
    String(rootOffset).padStart(10, "0") +
    " " +
    String(rootGenerationText).padStart(5, "0") +
    " n \n" +
    "trailer\n" +
    "<<\n" +
    "/Size " +
    size +
    "\n" +
    "/Root " +
    rootObjectText +
    " " +
    rootGenerationText +
    " R\n" +
    ">>\n\n" +
    "startxref\n" +
    xrefOffset +
    "\n%%EOF\n";

  return Uint8Array.from(
    Buffer.from(source.slice(0, xrefOffset) + sparseXref, "latin1"),
  );
}

interface LargeReachablePdfFixture {
  bytes: Uint8Array;
  indexedScanUpperBound: number;
  suffixScanWork: number;
}

function largeReachableClassicPdf(
  chainLength: number,
): LargeReachablePdfFixture {
  if (!Number.isSafeInteger(chainLength) || chainLength < 1) {
    throw new Error("Large PDF chain length must be positive");
  }

  let body = "%PDF-1.7\n%\u0081\u0081\u0081\u0081\n";
  const offsets = new Map<number, number>();
  const appendObject = (objectNumber: number, content: string): void => {
    offsets.set(objectNumber, Buffer.byteLength(body, "latin1"));
    body +=
      objectNumber +
      " 0 obj\n" +
      content +
      "\nendobj\n";
  };

  appendObject(
    1,
    "<<\n/Type /Pages\n/Kids [ 3 0 R ]\n/Count 1\n>>",
  );
  appendObject(
    2,
    "<<\n/Type /Catalog\n/Pages 1 0 R\n/WorkChain 4 0 R\n>>",
  );
  appendObject(
    3,
    "<<\n/Type /Page\n/Parent 1 0 R\n/MediaBox [ 0 0 100 100 ]\n>>",
  );

  const firstChainObject = 4;
  const lastChainObject = firstChainObject + chainLength - 1;
  for (
    let objectNumber = firstChainObject;
    objectNumber <= lastChainObject;
    objectNumber += 1
  ) {
    appendObject(
      objectNumber,
      objectNumber === lastChainObject
        ? "<< /Value 1 >>"
        : "<< /Next " + (objectNumber + 1) + " 0 R >>",
    );
  }

  const xrefOffset = Buffer.byteLength(body, "latin1");
  let xref =
    "xref\n" +
    "0 " +
    (lastChainObject + 1) +
    "\n" +
    "0000000000 65535 f \n";
  for (let objectNumber = 1; objectNumber <= lastChainObject; objectNumber += 1) {
    const offset = offsets.get(objectNumber);
    if (offset === undefined) {
      throw new Error("Large PDF object offset missing");
    }
    xref += String(offset).padStart(10, "0") + " 00000 n \n";
  }

  const trailer =
    "trailer\n" +
    "<<\n" +
    "/Size " +
    (lastChainObject + 1) +
    "\n" +
    "/Root 2 0 R\n" +
    ">>\n\n" +
    "startxref\n" +
    xrefOffset +
    "\n%%EOF\n";
  const orderedOffsets = Array.from(offsets.values()).sort(
    (left, right) => left - right,
  );
  const suffixScanWork = orderedOffsets.reduce(
    (total, offset) => total + (xrefOffset - offset),
    0,
  );
  const firstOffset = orderedOffsets[0];
  if (firstOffset === undefined) {
    throw new Error("Large PDF has no live objects");
  }

  return {
    bytes: Uint8Array.from(Buffer.from(body + xref + trailer, "latin1")),
    indexedScanUpperBound: xrefOffset - firstOffset,
    suffixScanWork,
  };
}

beforeAll(async () => {
  const rawImage = {
    create: {
      width: 3,
      height: 2,
      channels: 3 as const,
      background: { r: 30, g: 90, b: 160 },
    },
  };
  validPng = Uint8Array.from(await sharp(rawImage).png().toBuffer());
  validBaselineJpeg = Uint8Array.from(
    await sharp(rawImage).jpeg({ progressive: false, quality: 82 }).toBuffer(),
  );
  validProgressiveJpeg = Uint8Array.from(
    await sharp(rawImage).jpeg({ progressive: true, quality: 82 }).toBuffer(),
  );

  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage([320, 240]);
  validPdf = Uint8Array.from(
    await document.save({
      addDefaultPage: false,
      useObjectStreams: false,
      updateFieldAppearances: false,
    }),
  );

  const xrefStreamDocument = await PDFDocument.create({
    updateMetadata: false,
  });
  xrefStreamDocument.addPage([320, 240]);
  validXrefStreamPdf = Uint8Array.from(
    await xrefStreamDocument.save({
      addDefaultPage: false,
      useObjectStreams: true,
      updateFieldAppearances: false,
    }),
  );

  const noPages = await PDFDocument.create({ updateMetadata: false });
  emptyPdf = Uint8Array.from(
    await noPages.save({
      addDefaultPage: false,
      useObjectStreams: false,
      updateFieldAppearances: false,
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("private evidence upload validation", () => {
  it("verifies real images, classic/xref-stream PDFs, JSON, TXT, and CSV", async () => {
    const samples = [
      ["classic-report.pdf", "application/pdf", validPdf],
      ["xref-stream-report.pdf", "application/pdf", validXrefStreamPdf],
      ["capture.png", "image/png", validPng],
      ["baseline.jpg", "image/jpeg", validBaselineJpeg],
      ["progressive.jpeg", "image/jpeg", validProgressiveJpeg],
      ["results.json", "application/json", encoder.encode('{"passed":true,"count":3}')],
      ["notes.txt", "text/plain", encoder.encode("Observed result\r\nExpected result\n")],
      ["matrix.csv", "text/csv", encoder.encode("case,result\nlogin,passed\n")],
    ] as const;

    for (const [fileName, mimeType, bytes] of samples) {
      await expect(
        validatePrivateEvidenceUpload(input(fileName, mimeType, bytes)),
      ).resolves.toEqual({
        accepted: true,
        code: "accepted",
        upload: {
          fileName,
          mimeType,
          byteSize: bytes.byteLength,
          sha256Hex: digest(bytes),
        },
      });
    }
  });

  it("returns only canonical verified fields on success", async () => {
    const bytes = encoder.encode("plain evidence");
    const result = await validatePrivateEvidenceUpload(
      input("Ｅｖｉｄｅｎｃｅ.TXT", "text/plain", bytes),
    );

    expect(result).toEqual({
      accepted: true,
      code: "accepted",
      upload: {
        byteSize: bytes.byteLength,
        fileName: "Evidence.txt",
        mimeType: "text/plain",
        sha256Hex: digest(bytes),
      },
    });
    expect(result.accepted && "bytes" in result.upload).toBe(false);
  });

  it("accepts a Russian filename containing a combining mark", async () => {
    const bytes = encoder.encode("наблюдение");
    const fileName = "Отчёт́.TXT";
    const result = await validatePrivateEvidenceUpload(
      input(fileName, "text/plain", bytes),
    );

    expect(result.accepted).toBe(true);
    expect(result.accepted && result.upload.fileName).toBe(
      fileName.slice(0, -3).normalize("NFKC") + "txt",
    );
  });

  it("fails closed without throwing for null, primitives, symbols, and hostile input", async () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("must not escape");
        },
      },
    );
    const bytes = encoder.encode("content");
    const valid = input("notes.txt", "text/plain", bytes);
    const candidates: unknown[] = [
      null,
      undefined,
      true,
      7,
      "upload",
      Symbol("upload"),
      [],
      {},
      hostile,
      { ...valid, byteSize: Symbol("size") },
      { ...valid, bytes: Symbol("bytes") },
      { ...valid, expectedSha256Hex: Symbol("hash") },
      { ...valid, bytes: new DataView(bytes.buffer) },
    ];

    for (const candidate of candidates) {
      const result = await validatePrivateEvidenceUpload(candidate);
      expect(result.accepted).toBe(false);
      expect(Object.keys(result).sort()).toEqual(["accepted", "code"]);
    }
  });

  it("rejects declared byte counts that differ from the server bytes", async () => {
    const bytes = encoder.encode("content");
    await expect(
      validatePrivateEvidenceUpload({
        ...input("notes.txt", "text/plain", bytes),
        byteSize: bytes.byteLength + 1,
      }),
    ).resolves.toEqual({ accepted: false, code: "byte_size_mismatch" });
  });

  it("applies the JSON cap before parsing and each content cap before inspection", async () => {
    const parse = vi.spyOn(JSON, "parse");
    const jsonCap = getEvidenceUploadMaxBytes("application/json");
    const textCap = getEvidenceUploadMaxBytes("text/plain");
    const pdfCap = getEvidenceUploadMaxBytes("application/pdf");
    expect(jsonCap).not.toBeNull();
    expect(textCap).not.toBeNull();
    expect(pdfCap).not.toBeNull();

    for (const [fileName, mimeType, cap] of [
      ["results.json", "application/json", jsonCap],
      ["notes.txt", "text/plain", textCap],
      ["report.pdf", "application/pdf", pdfCap],
    ] as const) {
      await expect(
        validatePrivateEvidenceUpload({
          ...input(fileName, mimeType, encoder.encode("small")),
          byteSize: (cap ?? 0) + 1,
        }),
      ).resolves.toEqual({ accepted: false, code: "file_too_large" });
    }
    expect(parse).not.toHaveBeenCalled();
  });

  it("rejects zero and global max-plus-one metadata before reading bytes", async () => {
    const zero = input("notes.txt", "text/plain", new Uint8Array());
    await expect(validatePrivateEvidenceUpload(zero)).resolves.toEqual({
      accepted: false,
      code: "file_too_large",
    });

    await expect(
      validatePrivateEvidenceUpload({
        ...input("capture.png", "image/png", encoder.encode("small")),
        byteSize: MAX_EVIDENCE_UPLOAD_BYTES + 1,
      }),
    ).resolves.toEqual({ accepted: false, code: "file_too_large" });
  });

  it("rejects malformed, uppercase, symbol, and incorrect SHA-256 values", async () => {
    const bytes = encoder.encode("content");
    const valid = input("notes.txt", "text/plain", bytes);

    for (const expectedSha256Hex of [
      "bad",
      valid.expectedSha256Hex.toUpperCase(),
      Symbol("hash"),
    ]) {
      await expect(
        validatePrivateEvidenceUpload({ ...valid, expectedSha256Hex }),
      ).resolves.toEqual({ accepted: false, code: "invalid_sha256" });
    }
    await expect(
      validatePrivateEvidenceUpload({
        ...valid,
        expectedSha256Hex: "0".repeat(64),
      }),
    ).resolves.toEqual({ accepted: false, code: "sha256_mismatch" });
  });

  it("rejects corrupt CRC/IHDR/IDAT, excessive pixels, and nonconsecutive IDAT", async () => {
    for (const bytes of [
      pngWithCorruptCrc(),
      pngWithInvalidIhdr(),
      pngWithExcessiveDimensions(),
      pngWithEmptyIdat(),
      pngWithNonconsecutiveIdat(),
      pngWithCorruptImageData(),
      validPng.slice(0, -12),
    ]) {
      await expect(
        validatePrivateEvidenceUpload(input("capture.png", "image/png", bytes)),
      ).resolves.toEqual({ accepted: false, code: "invalid_content" });
    }
  });

  it("rejects no-table, undefined-table, synthetic, and truncated JPEG data", async () => {
    for (const bytes of [
      syntheticJpegWithoutTables(),
      jpegWithUndefinedQuantizationTable(),
      jpegWithUndefinedHuffmanTables(),
      validBaselineJpeg.slice(0, -2),
      concatenate(validBaselineJpeg, new Uint8Array([0])),
    ]) {
      await expect(
        validatePrivateEvidenceUpload(input("browser.jpg", "image/jpeg", bytes)),
      ).resolves.toEqual({ accepted: false, code: "invalid_content" });
    }
  });

  it("keeps a 5,000-object reachable PDF inside a linear scan budget", async () => {
    const fixture = largeReachableClassicPdf(5_000);

    // This fixture makes the rejected suffix-per-object strategy exceed the
    // file-sized indexed budget by three orders of magnitude without relying
    // on scheduler-sensitive wall-clock assertions.
    expect(fixture.suffixScanWork).toBeGreaterThan(
      fixture.bytes.byteLength * 1_000,
    );
    expect(fixture.indexedScanUpperBound).toBeLessThan(
      fixture.bytes.byteLength,
    );

    await expect(
      validatePrivateEvidenceUpload(
        input("large-reference-chain.pdf", "application/pdf", fixture.bytes),
      ),
    ).resolves.toMatchObject({ accepted: true, code: "accepted" });
  });

  it("rejects header/footer junk, truncation, encryption, and zero-page PDFs", async () => {
    for (const bytes of [
      encoder.encode("%PDF-1.7\nstartxref\n9\n%%EOF\n"),
      pdfWithLeadingJunk(),
      pdfWithTrailingJunk(),
      validPdf.slice(0, -16),
      pdfWithEncryptionDeclaration(),
      emptyPdf,
    ]) {
      await expect(
        validatePrivateEvidenceUpload(input("report.pdf", "application/pdf", bytes)),
      ).resolves.toEqual({ accepted: false, code: "invalid_content" });
    }
  });

  it("rejects startxref targeting an ordinary object that pdf-lib repairs", async () => {
    const bytes = pdfWithStartXrefAtOrdinaryObject();
    const repaired = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    expect(repaired.getPageCount()).toBe(1);

    await expect(
      validatePrivateEvidenceUpload(
        input("ordinary-object-xref.pdf", "application/pdf", bytes),
      ),
    ).resolves.toEqual({ accepted: false, code: "invalid_content" });
  });

  it("rejects an empty classic xref table that pdf-lib repairs", async () => {
    const bytes = pdfWithEmptyClassicXref();
    const repaired = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    expect(repaired.getPageCount()).toBe(1);

    await expect(
      validatePrivateEvidenceUpload(
        input("empty-xref.pdf", "application/pdf", bytes),
      ),
    ).resolves.toEqual({ accepted: false, code: "invalid_content" });
  });

  it("rejects sparse classic xref coverage that pdf-lib repairs", async () => {
    const bytes = pdfWithSparseClassicXref();
    const repaired = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    expect(repaired.getPageCount()).toBe(1);

    await expect(
      validatePrivateEvidenceUpload(
        input("sparse-xref.pdf", "application/pdf", bytes),
      ),
    ).resolves.toEqual({ accepted: false, code: "invalid_content" });
  });

  it("rejects a valid payload declared as another allowed content type", async () => {
    await expect(
      validatePrivateEvidenceUpload(input("spoof.png", "image/png", validPdf)),
    ).resolves.toEqual({ accepted: false, code: "invalid_content" });
  });

  it.each([
    ["malformed JSON", "results.json", "application/json", encoder.encode('{"ok":true} trailing')],
    ["non-UTF-8 JSON", "results.json", "application/json", new Uint8Array([0xc3, 0x28])],
    ["non-UTF-8 text", "notes.txt", "text/plain", new Uint8Array([0xc3, 0x28])],
    ["NUL in text", "notes.txt", "text/plain", new Uint8Array([0x61, 0, 0x62])],
    ["escape control in CSV", "matrix.csv", "text/csv", new Uint8Array([0x61, 0x1b, 0x62])],
    ["C1 control in text", "notes.txt", "text/plain", new Uint8Array([0x61, 0xc2, 0x80, 0x62])],
    ["bidirectional override in text", "notes.txt", "text/plain", encoder.encode("safe\u202espoof")],
  ])("rejects %s", async (_label, fileName, mimeType, bytes) => {
    await expect(
      validatePrivateEvidenceUpload(input(fileName, mimeType, bytes)),
    ).resolves.toEqual({ accepted: false, code: "invalid_content" });
  });

  it("fails closed if the runtime cannot calculate SHA-256", async () => {
    const bytes = encoder.encode("content");
    vi.stubGlobal("crypto", undefined);

    await expect(
      validatePrivateEvidenceUpload(input("notes.txt", "text/plain", bytes)),
    ).resolves.toEqual({ accepted: false, code: "hash_unavailable" });
  });

  it("does not include untrusted upload details in a failure result", async () => {
    const result = await validatePrivateEvidenceUpload({
      ...input("secret.txt", "text/plain", encoder.encode("private answer")),
      expectedSha256Hex: "0".repeat(64),
    });

    expect(result).toEqual({ accepted: false, code: "sha256_mismatch" });
    expect(JSON.stringify(result)).not.toContain("secret.txt");
    expect(JSON.stringify(result)).not.toContain("private answer");
  });
});
