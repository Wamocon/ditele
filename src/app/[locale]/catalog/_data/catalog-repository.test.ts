import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";

import {
  getPublishedCatalogCourse,
  getPublishedCatalogCourseById,
  listPublishedCatalog,
} from "./catalog-repository";

const courseId = "01980a20-0000-7000-8000-000000000001";

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    course_id: courseId,
    slug: "practical-software-testing",
    title: "Praktisches Softwaretesten",
    summary: "Evidenzbasierte Praxis",
    resolved_locale: "de",
    default_locale: "en",
    estimated_minutes: 480,
    version_number: 1,
    published_at: "2026-07-18T10:15:00+00:00",
    task_count: 1,
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
    ...overrides,
  };
}

function detailRow() {
  return {
    course_id: courseId,
    slug: "practical-software-testing",
    default_locale: "en",
    estimated_minutes: 480,
    version_number: 1,
    published_at: "2026-07-18T10:15:00+00:00",
    task_count: 1,
    localizations: [
      {
        locale: "en",
        title: "Practical Software Testing",
        summary: "Evidence-based practice",
        description_html: "<p>Practice testing.</p>",
        learning_outcomes: ["Design tests"],
      },
      {
        locale: "de",
        title: "Praktisches Softwaretesten",
        summary: "Evidenzbasierte Praxis",
        description_html: "<p>Teste praktisch.</p>",
        learning_outcomes: ["Tests entwerfen"],
      },
      {
        locale: "ru",
        title: "Практическое тестирование ПО",
        summary: "Практика на основе доказательств",
        description_html: "<p>Практикуйте тестирование.</p>",
        learning_outcomes: ["Проектировать тесты"],
      },
    ],
  };
}

function rpcClient(results: Record<string, { data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn((name: string) => {
      const result = results[name];
      if (!result) throw new Error(`Unexpected RPC ${name}`);
      return Promise.resolve(result);
    }),
  };
}

describe("published catalog repository", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("uses the immutable list RPC and searches only resolved locale text", async () => {
    const client = rpcClient({
      get_public_catalog: {
        data: [
          listRow(),
          listRow({
            course_id: "01980a20-0000-7000-8000-000000000002",
            slug: "other-course",
            title: "Anderer Kurs",
            summary: "Andere Zusammenfassung",
          }),
        ],
        error: null,
      },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const result = await listPublishedCatalog({
      locale: "de",
      search: "evidenz",
      page: 1,
      pageSize: 12,
    });

    expect(client.rpc).toHaveBeenCalledWith("get_public_catalog", {
      p_locale: "de",
    });
    expect(result.total).toBe(1);
    expect(result.items[0]?.title.de).toBe("Praktisches Softwaretesten");
  });

  it("uses one safe detail projection for slug and identifier reads", async () => {
    const client = rpcClient({
      get_public_catalog_course: { data: [detailRow()], error: null },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const detail = await getPublishedCatalogCourse("practical-software-testing");
    const summary = await getPublishedCatalogCourseById(courseId);

    expect(client.rpc).toHaveBeenNthCalledWith(1, "get_public_catalog_course", {
      p_slug: "practical-software-testing",
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "get_public_catalog_course", {
      p_course_id: courseId,
    });
    expect(detail?.description.en).toBe("Practice testing.");
    expect(summary).not.toHaveProperty("description");
    expect(summary?.title.ru).toBe("Практическое тестирование ПО");
  });

  it("returns null for a valid empty detail result", async () => {
    const client = rpcClient({
      get_public_catalog_course: { data: [], error: null },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(getPublishedCatalogCourse("missing-course")).resolves.toBeNull();
  });

  it("fails closed on database errors and malformed projection payloads", async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      rpcClient({
        get_public_catalog: { data: null, error: { code: "PGRST001" } },
      }) as never,
    );
    await expect(
      listPublishedCatalog({
        locale: "en",
        search: "",
        page: 1,
        pageSize: 12,
      }),
    ).rejects.toThrow("catalog.read_failed");

    vi.mocked(createServerClient).mockResolvedValue(
      rpcClient({
        get_public_catalog: {
          data: [{ course_id: courseId, snapshot: { privileged: true } }],
          error: null,
        },
      }) as never,
    );
    await expect(
      listPublishedCatalog({
        locale: "en",
        search: "",
        page: 1,
        pageSize: 12,
      }),
    ).rejects.toThrow();
  });
});
