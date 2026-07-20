import { describe, expect, it } from "vitest";

import {
  adminCourseRowSchema,
  contentArchiveImpactSchema,
  projectAdminCourseDetail,
  projectAdminCourseListItem,
  projectContentVersion,
  resolveLocalization,
  safePlainTextFromHtml,
} from "./model";

const ids = {
  course: "01980a20-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
  stage: "01980a23-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
  option: "01980a28-0000-7000-8000-000000000001",
  reviewer: "01980a00-0000-7000-8000-000000000003",
} as const;

const timestamp = "2026-07-18T10:00:00.000Z";

function courseRow() {
  return adminCourseRowSchema.parse({
    id: ids.course,
    organization_id: null,
    slug: "practical-software-testing",
    state: "active",
    default_locale: "en",
    estimated_minutes: 480,
    row_version: 2,
    updated_at: timestamp,
    course_localizations: [
      { locale: "en", title: "Practical testing", summary: "Practice safely.", description_html: "<p>Test &amp; learn.</p>", learning_outcomes: ["Design tests"] },
      { locale: "de", title: "Praktisches Testen", summary: "Sicher üben.", description_html: "<p>Testen und lernen.</p>", learning_outcomes: ["Tests entwerfen"] },
      { locale: "ru", title: "Практическое тестирование", summary: "Практика.", description_html: "<p>Тестировать.</p>", learning_outcomes: ["Тесты"] },
    ],
    content_versions: [{
      id: ids.version,
      version_number: 1,
      state: "published",
      change_summary: "First release",
      row_version: 1,
      snapshot: { seed: true },
      created_at: timestamp,
      updated_at: timestamp,
      published_at: timestamp,
      published_by: ids.reviewer,
      content_reviews: [{
        id: "01980a2d-0000-7000-8000-000000000001",
        decision: "approved",
        comment: "Ready",
        created_at: timestamp,
        reviewer_id: ids.reviewer,
        content_fingerprint: "a".repeat(64),
        expected_content_version_row_version: null,
      }],
    }],
    stages: [{
      id: ids.stage,
      content_version_id: ids.version,
      position: 0,
      state: "active",
      row_version: 1,
      stage_localizations: [
        { locale: "en", title: "Analysis", description_html: "<p>Analyze risk.</p>" },
        { locale: "de", title: "Analyse", description_html: "<p>Risiken analysieren.</p>" },
        { locale: "ru", title: "Анализ", description_html: "<p>Анализ рисков.</p>" },
      ],
      tasks: [{
        id: ids.task,
        content_version_id: ids.version,
        position: 0,
        task_kind: "practical",
        state: "active",
        target_url: "https://example.invalid/target",
        expected_minutes: 45,
        hint_penalty_basis_points: 0,
        row_version: 1,
        task_localizations: [
          { locale: "en", title: "Login flow", instructions_html: "<p>Design tests.</p>", hint_text: "Start with risks." },
          { locale: "de", title: "Login-Ablauf", instructions_html: "<p>Tests entwerfen.</p>", hint_text: "Mit Risiken beginnen." },
          { locale: "ru", title: "Вход", instructions_html: "<p>Создайте тесты.</p>", hint_text: null },
        ],
        task_options: [{ id: ids.option, labels: { en: "Boundary", de: "Grenzwert", ru: "Граница" }, position: 0 }],
        task_assessments: {
          question_translations: { en: "Which technique?", de: "Welche Technik?", ru: "Какой метод?" },
          selection_mode: "single",
          minimum_selections: 1,
          maximum_selections: 1,
        },
        task_hints: [],
      }],
    }],
    media_assets: [],
  });
}

describe("admin content runtime contract and projections", () => {
  it("rejects an unknown database lifecycle state", () => {
    const row = courseRow();
    expect(() => adminCourseRowSchema.parse({ ...row, state: "live" })).toThrow();
  });

  it("validates the complete archive-impact contract and exact fingerprints", () => {
    const contract = {
      content_version_id: ids.version,
      course_id: ids.course,
      row_version: 4,
      snapshot_sha256: "b".repeat(64),
      task_count: 3,
      task_schedule_count: 2,
      attempt_count: 7,
      open_attempt_count: 1,
      submission_count: 5,
      fingerprint: "a".repeat(64),
    };
    expect(contentArchiveImpactSchema.parse(contract)).toEqual(contract);
    expect(() => contentArchiveImpactSchema.parse({ ...contract, fingerprint: "a".repeat(63) })).toThrow();
    expect(() => contentArchiveImpactSchema.parse({ ...contract, open_attempt_count: -1 })).toThrow();
  });

  it("resolves requested locale first and follows a deterministic fallback", () => {
    const rows = [
      { locale: "en" as const, value: "English" },
      { locale: "de" as const, value: "Deutsch" },
    ];
    expect(resolveLocalization(rows, "de", "en")).toMatchObject({ resolvedLocale: "de", usedFallback: false });
    expect(resolveLocalization(rows, "ru", "de")).toMatchObject({ resolvedLocale: "de", usedFallback: true });
  });

  it("converts stored HTML to inert text and removes executable blocks", () => {
    expect(safePlainTextFromHtml('<p>Hello &amp; welcome</p><script>alert("secret")</script>')).toBe("Hello & welcome");
  });

  it("builds list and detail summaries from the validated row", () => {
    const row = courseRow();
    const listItem = projectAdminCourseListItem(row, "de");
    const detail = projectAdminCourseDetail(row, "en");
    expect(listItem).toMatchObject({ title: "Praktisches Testen", versionCount: 1, stageCount: 1, taskCount: 1 });
    expect(listItem.completeLocales).toEqual(["en", "de", "ru"]);
    expect(detail.description).toBe("Test & learn.");
    expect(detail.versions[0]).toMatchObject({ state: "published", reviewCount: 1 });
  });

  it("marks only the immutable review for the immediately preceding revision as current", () => {
    const row = courseRow();
    const baseVersion = row.content_versions[0];
    expect(baseVersion).toBeDefined();
    if (!baseVersion) throw new Error("missing version fixture");
    const reviewed = adminCourseRowSchema.parse({
      ...row,
      content_versions: [{
        ...baseVersion,
        state: "in_review",
        row_version: 4,
        published_at: null,
        content_reviews: [{
          ...baseVersion.content_reviews[0],
          expected_content_version_row_version: 3,
        }],
      }],
    });
    expect(projectAdminCourseDetail(reviewed, "en").versions[0]?.latestReview).toMatchObject({
      decision: "approved",
      current: true,
    });

    const staleReview = adminCourseRowSchema.parse({
      ...reviewed,
      content_versions: [{
        ...reviewed.content_versions[0],
        content_reviews: [{
          ...reviewed.content_versions[0]!.content_reviews[0],
          expected_content_version_row_version: 2,
        }],
      }],
    });
    expect(projectAdminCourseDetail(staleReview, "en").versions[0]?.latestReview?.current).toBe(false);
  });

  it("projects a complete learner-safe version without answer solution fields", () => {
    const projection = projectContentVersion(courseRow(), ids.version, "en", "learner");
    expect(projection?.issues).toEqual([]);
    expect(projection?.stages[0]?.tasks[0]).toMatchObject({
      title: "Login flow",
      hasHint: true,
      assessmentQuestion: "Which technique?",
      assessmentOptions: ["Boundary"],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("model_answer");
    expect(serialized).not.toContain("is_correct");
  });

  it("reports missing normalized version content instead of presenting it as ready", () => {
    const row = courseRow();
    const projection = projectContentVersion({ ...row, stages: [] }, ids.version, "en", "admin");
    expect(projection?.issues).toContainEqual(expect.objectContaining({ code: "missing_stage", path: "stages" }));
    expect(projectContentVersion(row, "01980a22-0000-7000-8000-000000000099", "en", "admin")).toBeNull();
  });
});
