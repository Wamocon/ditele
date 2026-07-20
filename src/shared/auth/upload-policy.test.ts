import { describe, expect, it } from "vitest";

import {
  getEvidenceUploadMaxBytes,
  MAX_EVIDENCE_FILE_NAME_BYTES,
  MAX_EVIDENCE_UPLOAD_BYTES,
  validateEvidenceUpload,
  validateEvidenceUploadMetadata,
} from "./upload-policy";

describe("evidence upload metadata policy", () => {
  it.each([
    ["report.pdf", "application/pdf"],
    ["capture.png", "image/png"],
    ["browser.jpeg", "image/jpeg"],
    ["browser.jpg", "image/jpeg"],
    ["results.json", "application/json"],
    ["notes.txt", "text/plain"],
    ["matrix.csv", "text/csv"],
  ])("accepts the canonical extension matrix for %s", (fileName, mimeType) => {
    expect(
      validateEvidenceUploadMetadata({ fileName, mimeType, byteSize: 1 }),
    ).toEqual({
      accepted: true,
      code: "accepted",
      metadata: { fileName, mimeType, byteSize: 1 },
    });
  });

  it("exports and enforces one exact per-MIME byte-cap matrix", () => {
    const cases = [
      ["application/json", "results.json", 1 * 1024 * 1024],
      ["text/plain", "notes.txt", 5 * 1024 * 1024],
      ["text/csv", "matrix.csv", 5 * 1024 * 1024],
      ["application/pdf", "report.pdf", 10 * 1024 * 1024],
      ["image/png", "capture.png", 25 * 1024 * 1024],
      ["image/jpeg", "capture.jpg", 25 * 1024 * 1024],
    ] as const;

    for (const [mimeType, fileName, cap] of cases) {
      expect(getEvidenceUploadMaxBytes(mimeType)).toBe(cap);
      expect(
        validateEvidenceUploadMetadata({ fileName, mimeType, byteSize: cap })
          .accepted,
      ).toBe(true);
      expect(
        validateEvidenceUploadMetadata({
          fileName,
          mimeType,
          byteSize: cap + 1,
        }),
      ).toEqual({ accepted: false, code: "file_too_large" });
    }

    expect(getEvidenceUploadMaxBytes("application/octet-stream")).toBeNull();
    expect(getEvidenceUploadMaxBytes(Symbol("mime"))).toBeNull();
  });

  it("returns an NFKC-normalized basename with a canonical lowercase extension", () => {
    expect(
      validateEvidenceUploadMetadata({
        fileName: "Ｒｅｐｏｒｔ.PDF",
        mimeType: "application/pdf",
        byteSize: 5,
      }),
    ).toEqual({
      accepted: true,
      code: "accepted",
      metadata: {
        fileName: "Report.pdf",
        mimeType: "application/pdf",
        byteSize: 5,
      },
    });
  });

  it("accepts multilingual combining marks after an initial letter", () => {
    const fileName = "Тест́.TXT";
    expect(
      validateEvidenceUploadMetadata({
        fileName,
        mimeType: "text/plain",
        byteSize: 5,
      }),
    ).toEqual({
      accepted: true,
      code: "accepted",
      metadata: {
        fileName: fileName.slice(0, -3).normalize("NFKC") + "txt",
        mimeType: "text/plain",
        byteSize: 5,
      },
    });
  });

  it("rejects zero, invalid, and globally excessive sizes without coercion", () => {
    for (const byteSize of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_EVIDENCE_UPLOAD_BYTES + 1,
      "1",
      Symbol("size"),
    ]) {
      expect(
        validateEvidenceUploadMetadata({
          fileName: "capture.png",
          mimeType: "image/png",
          byteSize,
        }),
      ).toEqual({ accepted: false, code: "file_too_large" });
    }
  });

  it("allows a stricter caller limit but never widens a MIME cap", () => {
    const metadata = {
      fileName: "notes.txt",
      mimeType: "text/plain",
      byteSize: 11,
    };

    expect(validateEvidenceUploadMetadata(metadata, 10)).toEqual({
      accepted: false,
      code: "file_too_large",
    });
    expect(
      validateEvidenceUploadMetadata(
        { ...metadata, byteSize: 5 * 1024 * 1024 + 1 },
        MAX_EVIDENCE_UPLOAD_BYTES,
      ),
    ).toEqual({ accepted: false, code: "file_too_large" });
    expect(validateEvidenceUploadMetadata(metadata, 0)).toEqual({
      accepted: false,
      code: "file_too_large",
    });
    expect(validateEvidenceUploadMetadata(metadata, Symbol("limit"))).toEqual({
      accepted: false,
      code: "file_too_large",
    });
  });

  it.each([
    "Application/PDF",
    "application/pdf; charset=binary",
    "image/jpg",
    "application/octet-stream",
    "text/html",
    "",
  ])("rejects a MIME value outside the exact allowlist: %s", (mimeType) => {
    expect(
      validateEvidenceUploadMetadata({
        fileName: "report.pdf",
        mimeType,
        byteSize: 1,
      }),
    ).toEqual({ accepted: false, code: "unsupported_type" });
  });

  it("fails closed for null, primitives, arrays, symbols, and hostile property access", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("must not escape");
        },
      },
    );
    const candidates: unknown[] = [
      null,
      undefined,
      true,
      1,
      "metadata",
      Symbol("metadata"),
      [],
      {},
      hostile,
      { mimeType: Symbol("mime"), byteSize: 1, fileName: "notes.txt" },
      { mimeType: "text/plain", byteSize: 1, fileName: Symbol("name") },
    ];

    for (const candidate of candidates) {
      expect(() => validateEvidenceUploadMetadata(candidate)).not.toThrow();
      expect(validateEvidenceUploadMetadata(candidate).accepted).toBe(false);
      expect(() => validateEvidenceUpload(candidate)).not.toThrow();
    }
  });

  it.each([
    ["report.png", "application/pdf"],
    ["capture.jpg", "image/png"],
    ["results.txt", "application/json"],
    ["notes.csv", "text/plain"],
    ["matrix.txt", "text/csv"],
    ["no-extension", "text/plain"],
  ])("rejects extension/MIME mismatch for %s", (fileName, mimeType) => {
    expect(
      validateEvidenceUploadMetadata({ fileName, mimeType, byteSize: 1 }),
    ).toEqual({ accepted: false, code: "extension_mismatch" });
  });

  it.each([
    "../report.pdf",
    "folder/report.pdf",
    "folder\\report.pdf",
    "report\0.pdf",
    " report.pdf",
    "report.pdf ",
    ".report.pdf",
    "report..pdf",
    "report:final.pdf",
    "report\u202ecod.pdf",
    "CON.pdf",
    "CON.audit.pdf",
    "\u0301report.pdf",
  ])("rejects an unsafe or ambiguous basename: %s", (fileName) => {
    expect(
      validateEvidenceUploadMetadata({
        fileName,
        mimeType: "application/pdf",
        byteSize: 1,
      }),
    ).toEqual({ accepted: false, code: "unsafe_name" });
  });

  it.each([
    ["LPT1.any.txt", "text/plain"],
    ["com9.capture.jpg", "image/jpeg"],
  ])("rejects a Windows device stem before an inner dot: %s", (fileName, mimeType) => {
    expect(
      validateEvidenceUploadMetadata({ fileName, mimeType, byteSize: 1 }),
    ).toEqual({ accepted: false, code: "unsafe_name" });
  });

  it("measures the normalized filename in UTF-8 bytes", () => {
    const acceptedName = `${"a".repeat(MAX_EVIDENCE_FILE_NAME_BYTES - 4)}.pdf`;
    const rejectedName = `${"a".repeat(MAX_EVIDENCE_FILE_NAME_BYTES - 3)}.pdf`;

    expect(
      validateEvidenceUploadMetadata({
        fileName: acceptedName,
        mimeType: "application/pdf",
        byteSize: 1,
      }).accepted,
    ).toBe(true);
    expect(
      validateEvidenceUploadMetadata({
        fileName: rejectedName,
        mimeType: "application/pdf",
        byteSize: 1,
      }),
    ).toEqual({ accepted: false, code: "unsafe_name" });
  });

  it("keeps the legacy coarse result shape while applying the stricter policy", () => {
    expect(
      validateEvidenceUpload({
        fileName: "report.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
      }),
    ).toEqual({ accepted: true, code: "accepted" });
    expect(
      validateEvidenceUpload({
        fileName: "report.png",
        mimeType: "application/pdf",
        byteSize: 1024,
      }),
    ).toEqual({ accepted: false, code: "extension_mismatch" });
  });
});
