import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/shared/database/server";

import { readAdministrationOperations } from "./operations";

function queryResult(data: unknown, error: unknown = null) {
  const result = { data, error };
  const builder = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue(result);
  builder.then.mockImplementation((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );
  return builder;
}

const organizationId = "01980a10-0000-7000-8000-000000000001";
const learnerId = "01980a00-0000-7000-8000-000000000001";
const courseId = "01980a20-0000-7000-8000-000000000001";

function enrollment(state: string, offset: number) {
  return {
    id: `01980a33-0000-7000-8000-${offset.toString().padStart(12, "0")}`,
    organization_id: organizationId,
    learner_id: learnerId,
    course_id: courseId,
    state,
    row_version: 1,
  };
}

describe("readAdministrationOperations", () => {
  beforeEach(() => {
    vi.mocked(createServerClient).mockReset();
  });

  it("maps every canonical enrollment state without accepting obsolete names", async () => {
    const enrollments = [
      enrollment("requested", 1),
      enrollment("approved", 2),
      enrollment("rejected", 3),
      enrollment("assigned", 4),
      enrollment("cancelled", 5),
      enrollment("completed", 6),
    ];
    const client = {
      from: vi.fn((table: string) => table === "enrollments"
        ? queryResult(enrollments)
        : queryResult([])),
    };
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const result = await readAdministrationOperations();

    expect(result.applications.map(({ state }) => state)).toEqual([
      "pending",
      "accepted",
      "rejected",
      "accepted",
      "rejected",
      "accepted",
    ]);
  });

  it("fails closed instead of presenting an unknown database state as accepted", async () => {
    const client = {
      from: vi.fn((table: string) => table === "enrollments"
        ? queryResult([enrollment("declined", 1)])
        : queryResult([])),
    };
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readAdministrationOperations()).rejects.toThrow();
  });
});
