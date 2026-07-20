import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";

import { readAdminTasks } from "./data";

const principal = {
  permissions: ["content.manage"],
} as never;

function taskQuery() {
  const query = {
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockResolvedValue({ count: 0, data: [], error: null });
  return query;
}

describe("admin task inventory PostgREST relationship contract", () => {
  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("selects the exact composite stage and publication relationships", async () => {
    const query = taskQuery();
    const client = { from: vi.fn().mockReturnValue(query) };
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdminTasks(principal, "en", 1)).resolves.toMatchObject({
      items: [],
      total: 0,
    });

    const projection = String(query.select.mock.calls[0]?.[0]);
    for (const relationship of [
      "task_localizations!task_localizations_task_id_fkey",
      "task_options!task_options_task_id_fkey",
      "task_hints!task_hints_task_id_fkey",
      "task_assessments!task_assessments_task_id_fkey",
      "courses!tasks_course_id_fkey!inner",
      "course_localizations!course_localizations_course_id_fkey",
      "stages!tasks_stage_course_fk!inner",
      "stage_localizations!stage_localizations_stage_id_fkey",
      "content_versions!tasks_version_course_fk",
    ]) {
      expect(projection).toContain(relationship);
    }
  });
});
