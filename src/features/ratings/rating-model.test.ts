import { describe, expect, it } from "vitest";

import { parseRatingForm, projectExistingRating } from "./rating-model";

function ratingFormData(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("ratingTarget", "course");
  form.set("targetId", "01980a20-0000-7000-8000-000000000001");
  form.set("score", "5");
  form.set("comment", "  Very practical  ");
  form.set("expectedVersion", "0");
  form.set("idempotencyKey", "rating-course-unit-0001");
  form.set("locale", "en");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("parseRatingForm", () => {
  it("parses and normalizes a valid course rating submission", () => {
    const input = parseRatingForm(ratingFormData());
    expect(input).toEqual({
      ratingTarget: "course",
      targetId: "01980a20-0000-7000-8000-000000000001",
      score: 5,
      comment: "Very practical",
      expectedVersion: 0,
      idempotencyKey: "rating-course-unit-0001",
      locale: "en",
    });
  });

  it("accepts a task target and coerces numeric fields", () => {
    const input = parseRatingForm(
      ratingFormData({
        ratingTarget: "task",
        targetId: "01980a26-0000-7000-8000-000000000001",
        score: "3",
        expectedVersion: "2",
      }),
    );
    expect(input.ratingTarget).toBe("task");
    expect(input.score).toBe(3);
    expect(input.expectedVersion).toBe(2);
  });

  it("treats a blank comment as null", () => {
    const input = parseRatingForm(ratingFormData({ comment: "   " }));
    expect(input.comment).toBeNull();
  });

  it("rejects a score outside 1..5", () => {
    expect(() => parseRatingForm(ratingFormData({ score: "0" }))).toThrow();
    expect(() => parseRatingForm(ratingFormData({ score: "6" }))).toThrow();
  });

  it("rejects an invalid target id", () => {
    expect(() => parseRatingForm(ratingFormData({ targetId: "not-a-uuid" }))).toThrow();
  });

  it("rejects an unsupported locale", () => {
    expect(() => parseRatingForm(ratingFormData({ locale: "fr" }))).toThrow();
  });

  it("rejects an unsupported target", () => {
    expect(() => parseRatingForm(ratingFormData({ ratingTarget: "trainer" }))).toThrow();
  });

  it("rejects an over-length comment", () => {
    expect(() =>
      parseRatingForm(ratingFormData({ comment: "x".repeat(2001) })),
    ).toThrow();
  });
});

describe("projectExistingRating", () => {
  it("returns null when no rating exists", () => {
    expect(projectExistingRating(null)).toBeNull();
    expect(projectExistingRating(undefined)).toBeNull();
  });

  it("maps a database row to the domain shape", () => {
    expect(
      projectExistingRating({ score: 4, comment: "Updated", row_version: 2 }),
    ).toEqual({ score: 4, comment: "Updated", rowVersion: 2 });
  });

  it("preserves a null comment", () => {
    expect(
      projectExistingRating({ score: 5, comment: null, row_version: 1 }),
    ).toEqual({ score: 5, comment: null, rowVersion: 1 });
  });

  it("rejects a malformed row", () => {
    expect(() =>
      projectExistingRating({ score: 9, comment: "x", row_version: 1 }),
    ).toThrow();
  });
});
