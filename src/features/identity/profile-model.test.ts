import { describe, expect, it } from "vitest";

import {
  isValidIanaTimezone,
  parseUpdateProfileForm,
  projectLearnerProfile,
} from "./profile-model";

describe("learner profile model", () => {
  it("normalizes the supported self-service fields", () => {
    const formData = new FormData();
    formData.set("displayName", "  Lena Quality  ");
    formData.set("locale", "de");
    formData.set("timezone", " Europe/Berlin ");
    formData.set("expectedVersion", "3");
    formData.set("idempotencyKey", "profile-model-test-0001");

    expect(parseUpdateProfileForm(formData)).toEqual({
      displayName: "Lena Quality",
      locale: "de",
      timezone: "Europe/Berlin",
      expectedVersion: 3,
      idempotencyKey: "profile-model-test-0001",
    });
  });

  it("rejects unknown time zones and unsupported locales", () => {
    expect(isValidIanaTimezone("Europe/Berlin")).toBe(true);
    expect(isValidIanaTimezone("Mars/Olympus")).toBe(false);

    const formData = new FormData();
    formData.set("displayName", "Lena");
    formData.set("locale", "fr");
    formData.set("timezone", "Mars/Olympus");
    formData.set("expectedVersion", "1");
    formData.set("idempotencyKey", "profile-model-test-0002");
    expect(() => parseUpdateProfileForm(formData)).toThrow();
  });

  it("projects only the learner-visible profile fields", () => {
    expect(projectLearnerProfile({
      user_id: "01980a00-0000-7000-8000-000000000001",
      display_name: "Lena Learner",
      locale: "en",
      timezone: "UTC",
      row_version: 2,
      updated_at: "2026-07-18 10:00:00+00",
    })).toEqual({
      userId: "01980a00-0000-7000-8000-000000000001",
      displayName: "Lena Learner",
      locale: "en",
      timezone: "UTC",
      rowVersion: 2,
      updatedAt: "2026-07-18T10:00:00.000Z",
    });
  });
});
