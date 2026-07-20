import { describe, expect, it } from "vitest";

import {
  classifyContentLifecycleRpcError,
  parseContentArchiveCommand,
  parseContentLifecycleCommand,
  parseContentReviewCommand,
} from "./lifecycle-validation";

const ids = {
  course: "01980a20-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
};

function commonForm(): FormData {
  const form = new FormData();
  form.set("locale", "de");
  form.set("courseId", ids.course);
  form.set("contentVersionId", ids.version);
  form.set("expectedVersion", "4");
  form.set("idempotencyKey", "content-command:stable-0001");
  return form;
}

describe("content lifecycle command validation", () => {
  it("parses the common optimistic and idempotent command envelope", () => {
    expect(parseContentLifecycleCommand(commonForm())).toEqual({
      locale: "de",
      courseId: ids.course,
      contentVersionId: ids.version,
      expectedVersion: 4,
      idempotencyKey: "content-command:stable-0001",
    });
  });

  it("requires an explicit review decision and non-blank comment", () => {
    const valid = commonForm();
    valid.set("decision", "approved");
    valid.set("comment", "  Ready for publication.  ");
    expect(parseContentReviewCommand(valid)).toMatchObject({
      decision: "approved",
      comment: "Ready for publication.",
    });

    const invalid = commonForm();
    invalid.set("decision", "approved");
    invalid.set("comment", "   ");
    expect(() => parseContentReviewCommand(invalid)).toThrow();
  });

  it("requires the exact archive fingerprint, reason, and explicit confirmation", () => {
    const valid = commonForm();
    valid.set("impactFingerprint", "a".repeat(64));
    valid.set("reason", "Superseded by a corrected publication.");
    valid.set("confirmImpact", "confirmed");
    expect(parseContentArchiveCommand(valid)).toMatchObject({
      impactFingerprint: "a".repeat(64),
      confirmImpact: "confirmed",
    });

    valid.set("impactFingerprint", "a".repeat(63));
    expect(() => parseContentArchiveCommand(valid)).toThrow();
    valid.set("impactFingerprint", "a".repeat(64));
    valid.delete("confirmImpact");
    expect(() => parseContentArchiveCommand(valid)).toThrow();
  });

  it("rejects short idempotency keys and non-positive revisions", () => {
    const form = commonForm();
    form.set("idempotencyKey", "too-short");
    form.set("expectedVersion", "0");
    expect(() => parseContentLifecycleCommand(form)).toThrow();
  });

  it("classifies stale, authorization, readiness, approval, input, and idempotency failures distinctly", () => {
    expect(classifyContentLifecycleRpcError({ code: "40001", message: "stale" }, "submit")).toBe("stale");
    expect(classifyContentLifecycleRpcError({ code: "42501", message: "denied" }, "review")).toBe("forbidden");
    expect(classifyContentLifecycleRpcError({ code: "23514", message: "incomplete" }, "review")).toBe("readiness");
    expect(classifyContentLifecycleRpcError({ code: "23514", message: "approval required" }, "publish")).toBe("approval");
    expect(classifyContentLifecycleRpcError({ code: "22023", message: "invalid command" }, "archive")).toBe("input");
    expect(classifyContentLifecycleRpcError({ code: "22023", message: "Idempotency key reused" }, "archive")).toBe("idempotency");
    expect(classifyContentLifecycleRpcError({ code: "XX000", message: "provider failure" }, "publish")).toBe("failed");
  });
});
