import { describe, expect, it } from "vitest";

import {
  buildLearnerCertificateRecords,
  resolveCourseTitle,
} from "./learner-certificate-records";

describe("learner certificate records", () => {
  it("resolves course titles using requested, English, then first localization", () => {
    const translations = [
      { locale: "de", title: "Softwaretesten" },
      { locale: "en", title: "Software testing" },
    ];
    expect(resolveCourseTitle(translations, "de")).toBe("Softwaretesten");
    expect(resolveCourseTitle(translations, "ru")).toBe("Software testing");
    expect(resolveCourseTitle([{ locale: "de", title: "Softwaretesten" }], "ru"))
      .toBe("Softwaretesten");
  });

  it("maps only the safe learner projection and drops private verification material", () => {
    const result = buildLearnerCertificateRecords([{
      id: "01980a50-0000-7000-8000-000000000001",
      state: "available",
      certificate_type: "course_completion",
      course_id: "01980a20-0000-7000-8000-000000000001",
      issued_at: "2026-07-17T10:00:00.000Z",
      available_at: "2026-07-18T10:00:00.000Z",
      expires_at: null,
      revoked_at: null,
      created_at: "2026-07-17T09:00:00.000Z",
      courses: {
        course_localizations: [
          { locale: "en", title: "Practical testing" },
          { locale: "de", title: "Praktisches Testen" },
        ],
      },
      verification_token_hash: "must-not-leave-the-adapter",
      media_asset_id: "must-not-leave-the-adapter",
    }], "de");

    expect(result[0]).toMatchObject({
      courseTitle: "Praktisches Testen",
      state: "available",
      type: "course_completion",
    });
    expect(result[0]).not.toHaveProperty("verification_token_hash");
    expect(result[0]).not.toHaveProperty("media_asset_id");
  });
});
