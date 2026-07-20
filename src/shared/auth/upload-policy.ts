export const MAX_EVIDENCE_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_EVIDENCE_FILE_NAME_BYTES = 255;

const MIME_TYPE_EXTENSIONS = {
  "application/json": ["json"],
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpeg", "jpg"],
  "image/png": ["png"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
} as const;

const MIME_TYPE_MAX_BYTES = {
  "application/json": 1 * 1024 * 1024,
  "application/pdf": 10 * 1024 * 1024,
  "image/jpeg": MAX_EVIDENCE_UPLOAD_BYTES,
  "image/png": MAX_EVIDENCE_UPLOAD_BYTES,
  "text/csv": 5 * 1024 * 1024,
  "text/plain": 5 * 1024 * 1024,
} as const satisfies Record<keyof typeof MIME_TYPE_EXTENSIONS, number>;

export type EvidenceMimeType = keyof typeof MIME_TYPE_EXTENSIONS;

export interface UploadMetadata {
  mimeType: string;
  byteSize: number;
  fileName: string;
}

export type UploadPolicyFailureCode =
  | "file_too_large"
  | "unsupported_type"
  | "unsafe_name"
  | "extension_mismatch";

export interface ValidatedUploadMetadata {
  byteSize: number;
  fileName: string;
  mimeType: EvidenceMimeType;
}

export type UploadMetadataValidationResult =
  | {
      accepted: true;
      code: "accepted";
      metadata: ValidatedUploadMetadata;
    }
  | {
      accepted: false;
      code: UploadPolicyFailureCode;
    };

/**
 * Compatibility result for the original coarse upload policy check.
 * Use `validateEvidenceUploadMetadata` when canonical metadata is required.
 */
export type UploadPolicyResult =
  | { accepted: true; code: "accepted" }
  | { accepted: false; code: UploadPolicyFailureCode };

const SAFE_FILE_NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._()-]*$/u;
const UNSAFE_DIRECTIONAL_FORMATTING = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const UNSAFE_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const WINDOWS_RESERVED_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

function isEvidenceMimeType(value: unknown): value is EvidenceMimeType {
  return typeof value === "string" && Object.hasOwn(MIME_TYPE_EXTENSIONS, value);
}

/**
 * Returns the one authoritative byte cap for an allowed evidence MIME type.
 * Unknown runtime input is rejected without string coercion.
 */
export function getEvidenceUploadMaxBytes(mimeType: unknown): number | null {
  return isEvidenceMimeType(mimeType) ? MIME_TYPE_MAX_BYTES[mimeType] : null;
}

function effectiveMaximum(maxBytes: unknown, mimeType: EvidenceMimeType): number | null {
  if (
    typeof maxBytes !== "number" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    return null;
  }

  return Math.min(maxBytes, MIME_TYPE_MAX_BYTES[mimeType]);
}

function readProperty(value: unknown, property: keyof UploadMetadata): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }

  try {
    return Reflect.get(value, property);
  } catch {
    return undefined;
  }
}

function canonicalFileName(
  fileName: string,
  mimeType: EvidenceMimeType,
): { fileName: string } | { code: "unsafe_name" | "extension_mismatch" } {
  if (fileName.length === 0) {
    return { code: "unsafe_name" };
  }

  const normalized = fileName.normalize("NFKC");
  if (
    normalized !== normalized.trim() ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("..") ||
    UNSAFE_CONTROL_CHARACTER.test(normalized) ||
    UNSAFE_DIRECTIONAL_FORMATTING.test(normalized) ||
    !SAFE_FILE_NAME.test(normalized) ||
    new TextEncoder().encode(normalized).byteLength > MAX_EVIDENCE_FILE_NAME_BYTES
  ) {
    return { code: "unsafe_name" };
  }

  const extensionSeparator = normalized.lastIndexOf(".");
  if (extensionSeparator <= 0 || extensionSeparator === normalized.length - 1) {
    return { code: "extension_mismatch" };
  }

  const stem = normalized.slice(0, extensionSeparator);
  const windowsDeviceStem = stem.split(".", 1)[0] ?? stem;
  const extension = normalized.slice(extensionSeparator + 1).toLocaleLowerCase("en-US");
  const extensionMatches = MIME_TYPE_EXTENSIONS[mimeType].some(
    (candidate) => candidate === extension,
  );
  if (
    stem.endsWith(" ") ||
    stem.endsWith(".") ||
    WINDOWS_RESERVED_STEM.test(windowsDeviceStem) ||
    !extensionMatches
  ) {
    return { code: extensionMatches ? "unsafe_name" : "extension_mismatch" };
  }

  return { fileName: `${stem}.${extension}` };
}

/**
 * Validates untrusted upload metadata and returns a canonical, storage-safe
 * basename. This check is intentionally independent from content inspection;
 * callers must also verify the bytes before persisting an upload.
 */
export function validateEvidenceUploadMetadata(
  metadata: unknown,
  maxBytes: unknown = MAX_EVIDENCE_UPLOAD_BYTES,
): UploadMetadataValidationResult {
  const mimeType = readProperty(metadata, "mimeType");
  if (!isEvidenceMimeType(mimeType)) {
    return { accepted: false, code: "unsupported_type" };
  }

  const maximum = effectiveMaximum(maxBytes, mimeType);
  const byteSize = readProperty(metadata, "byteSize");
  if (
    maximum === null ||
    typeof byteSize !== "number" ||
    !Number.isSafeInteger(byteSize) ||
    byteSize <= 0 ||
    byteSize > maximum
  ) {
    return { accepted: false, code: "file_too_large" };
  }

  const rawFileName = readProperty(metadata, "fileName");
  if (typeof rawFileName !== "string") {
    return { accepted: false, code: "unsafe_name" };
  }
  const fileName = canonicalFileName(rawFileName, mimeType);
  if ("code" in fileName) {
    return { accepted: false, code: fileName.code };
  }

  return {
    accepted: true,
    code: "accepted",
    metadata: {
      byteSize,
      fileName: fileName.fileName,
      mimeType,
    },
  };
}

export function validateEvidenceUpload(
  metadata: unknown,
  maxBytes: unknown = MAX_EVIDENCE_UPLOAD_BYTES,
): UploadPolicyResult {
  const result = validateEvidenceUploadMetadata(metadata, maxBytes);
  return result.accepted
    ? { accepted: true, code: "accepted" }
    : { accepted: false, code: result.code };
}
