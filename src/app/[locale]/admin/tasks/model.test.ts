import { describe, expect, it } from "vitest";

import { projectAdminTask } from "./model";

const row = {
  id: "01980a26-0000-7000-8000-000000000001",
  course_id: "01980a20-0000-7000-8000-000000000001",
  stage_id: "01980a23-0000-7000-8000-000000000001",
  content_version_id: "01980a22-0000-7000-8000-000000000001",
  position: 0,
  task_kind: "practical",
  state: "active",
  target_url: "https://example.invalid/lab",
  expected_minutes: 45,
  row_version: 2,
  updated_at: "2026-07-18 10:00:00+00",
  task_localizations: [
    { locale: "en", title: "Analyze login risks" },
    { locale: "de", title: "Login-Risiken analysieren" },
  ],
  task_options: [{ id: "01980a28-0000-7000-8000-000000000001" }],
  task_hints: [{ id: "01980a29-0000-7000-8000-000000000001" }],
  task_assessments: { task_id: "01980a26-0000-7000-8000-000000000001" },
  courses: {
    id: "01980a20-0000-7000-8000-000000000001",
    slug: "practical-testing",
    course_localizations: [{ locale: "en", title: "Practical testing" }],
  },
  stages: {
    id: "01980a23-0000-7000-8000-000000000001",
    position: 0,
    stage_localizations: [{ locale: "en", title: "Risk analysis" }],
  },
  content_versions: {
    id: "01980a22-0000-7000-8000-000000000001",
    version_number: 1,
    state: "published",
  },
} as const;

describe("projectAdminTask", () => {
  it("projects version, assessment, and localized inventory facts", () => {
    expect(projectAdminTask(row, "de")).toMatchObject({
      title: "Login-Risiken analysieren",
      resolvedLocale: "de",
      usedFallback: false,
      courseTitle: "Practical testing",
      stageTitle: "Risk analysis",
      versionNumber: 1,
      versionState: "published",
      hasTarget: true,
      hasAssessment: true,
      optionCount: 1,
      hintCount: 1,
      completeLocales: ["en", "de"],
      updatedAt: "2026-07-18T10:00:00.000Z",
    });
  });

  it("falls back to English without claiming the requested locale", () => {
    expect(projectAdminTask(row, "ru")).toMatchObject({
      title: "Analyze login risks",
      resolvedLocale: "en",
      usedFallback: true,
    });
  });

  it("rejects invalid database state instead of coercing it", () => {
    expect(() => projectAdminTask({ ...row, state: "published" }, "en")).toThrow();
  });
});
