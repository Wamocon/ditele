import { describe, expect, it } from "vitest";

import {
  PublicCatalogCourseProjectionRowSchema,
  PublicCatalogProjectionRowSchema,
  catalogProjectionMatchesSearch,
  toCatalogCourse,
  toCatalogCourseDetail,
} from "./published-catalog-projection";

const listProjection = {
  course_id: "01980a20-0000-7000-8000-000000000001",
  slug: "practical-software-testing",
  title: "Praktisches Softwaretesten",
  summary: "Evidenzbasierte Praxis",
  resolved_locale: "de",
  default_locale: "en",
  estimated_minutes: 480,
  version_number: 2,
  published_at: "2026-07-18T10:15:00+00:00",
  task_count: 7,
  title_localizations: {
    en: "Practical Software Testing",
    de: "Praktisches Softwaretesten",
    ru: "Практическое тестирование ПО",
  },
  summary_localizations: {
    en: "Evidence-based practice",
    de: "Evidenzbasierte Praxis",
    ru: "Практика на основе доказательств",
  },
} as const;

const detailProjection = {
  course_id: listProjection.course_id,
  slug: listProjection.slug,
  default_locale: "en",
  estimated_minutes: 480,
  version_number: 2,
  published_at: "2026-07-18T10:15:00+00:00",
  task_count: 7,
  localizations: [
    {
      locale: "en",
      title: "Practical Software Testing",
      summary: "Evidence-based practice",
      description_html:
        "<p>Practice <strong>test design</strong>.</p><script>alert('x')</script>",
      learning_outcomes: ["Design effective tests", "Document evidence"],
    },
    {
      locale: "de",
      title: "Praktisches Softwaretesten",
      summary: "Evidenzbasierte Praxis",
      description_html:
        "<p>Übe den <strong>Testentwurf</strong>.</p><!-- editor note -->",
      learning_outcomes: ["Wirksame Tests entwerfen"],
    },
    {
      locale: "ru",
      title: "Практическое тестирование ПО",
      summary: "Практика на основе доказательств",
      description_html: "<p>Практикуйте тест-дизайн.</p>",
      learning_outcomes: ["Проектировать тесты", "Документировать доказательства"],
    },
  ],
} as const;

describe("published catalog projection", () => {
  it("maps only immutable safe list fields into the canonical catalog model", () => {
    expect(toCatalogCourse(listProjection)).toEqual({
      id: listProjection.course_id,
      slug: listProjection.slug,
      version: 2,
      title: listProjection.title_localizations,
      summary: listProjection.summary_localizations,
      durationMinutes: 480,
      taskCount: 7,
      availability: "request_required",
      tags: [],
      publishedAt: "2026-07-18T10:15:00.000Z",
    });
  });

  it("searches the database-resolved locale text without cross-locale leakage", () => {
    const row = PublicCatalogProjectionRowSchema.parse(listProjection);

    expect(catalogProjectionMatchesSearch(row, "de", "EVIDENZ")).toBe(true);
    expect(catalogProjectionMatchesSearch(row, "de", "Evidence-based")).toBe(false);
    expect(catalogProjectionMatchesSearch(row, "de", "   ")).toBe(true);
  });

  it("maps safe detail localizations and removes executable or editor markup", () => {
    const course = toCatalogCourseDetail(detailProjection);

    expect(course.description).toEqual({
      en: "Practice test design .",
      de: "Übe den Testentwurf .",
      ru: "Практикуйте тест-дизайн.",
    });
    expect(course.description.en).not.toContain("alert");
    expect(course.learningOutcomes).toEqual([
      {
        en: "Design effective tests",
        de: "Wirksame Tests entwerfen",
        ru: "Проектировать тесты",
      },
      {
        en: "Document evidence",
        ru: "Документировать доказательства",
      },
    ]);
  });

  it("rejects duplicate or incomplete locale projections at runtime", () => {
    expect(() =>
      PublicCatalogCourseProjectionRowSchema.parse({
        ...detailProjection,
        localizations: [
          detailProjection.localizations[0],
          detailProjection.localizations[0],
          detailProjection.localizations[2],
        ],
      }),
    ).toThrow();

    expect(() =>
      PublicCatalogProjectionRowSchema.parse({
        ...listProjection,
        title_localizations: { en: "Only English" },
      }),
    ).toThrow();
  });

  it("rejects privileged or unexpected fields instead of trusting an RPC payload", () => {
    expect(() =>
      PublicCatalogCourseProjectionRowSchema.parse({
        ...detailProjection,
        task_model_answers: ["hidden solution"],
      }),
    ).toThrow();
  });
});
