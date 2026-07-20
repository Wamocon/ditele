import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";

import { readAdminCourse, readAdminCourseList } from "./data";

const principal = {
  permissions: ["content.manage"],
} as never;

type QueryResult = {
  readonly count?: number | null;
  readonly data: unknown;
  readonly error: unknown;
};

function listQuery(result: QueryResult) {
  const query = {
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockResolvedValue(result);
  return query;
}

function detailQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(result);
  return query;
}

describe("admin content PostgREST relationship contract", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("uses migration-defined foreign keys for list and detail embeds", async () => {
    const list = listQuery({ count: 0, data: [], error: null });
    const detail = detailQuery({ data: null, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(list)
        .mockReturnValueOnce(detail),
    };
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdminCourseList(principal, "en", 1)).resolves.toMatchObject({
      courses: [],
      total: 0,
    });
    await expect(
      readAdminCourse(
        principal,
        "01980a20-0000-7000-8000-000000000094",
        "en",
      ),
    ).resolves.toBeNull();

    const listProjection = String(list.select.mock.calls[0]?.[0]);
    expect(listProjection).toContain(
      "stages!stages_course_id_fkey",
    );
    expect(listProjection).toContain("tasks!tasks_stage_course_fk");

    const detailProjection = String(detail.select.mock.calls[0]?.[0]);
    for (const relationship of [
      "course_localizations!course_localizations_course_id_fkey",
      "content_versions!content_versions_course_id_fkey",
      "content_reviews!content_reviews_content_version_id_fkey",
      "stages!stages_course_id_fkey",
      "stage_localizations!stage_localizations_stage_id_fkey",
      "tasks!tasks_stage_course_fk",
      "task_localizations!task_localizations_task_id_fkey",
      "task_options!task_options_task_id_fkey",
      "task_assessments!task_assessments_task_id_fkey",
      "task_hints!task_hints_task_id_fkey",
      "media_assets!media_assets_course_id_fkey",
    ]) {
      expect(detailProjection).toContain(relationship);
    }
  });
});
