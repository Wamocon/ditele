import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/[locale]/_data/principal", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { createServerClient } from "@/shared/database/server";

import { readLearnerSkillCollection } from "./data";

type QueryResult = { data: unknown; error: unknown };

const learnerId = "01980a00-0000-7000-8000-000000000001";
const organizationId = "01980a10-0000-7000-8000-000000000001";
const skillId = "01980a2a-0000-7000-8000-000000000001";

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    or: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.then.mockImplementation((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject)
  );
  return builder;
}

function clientFixture(overrides: Partial<Record<"skills" | "mastery", QueryResult>> = {}) {
  const builders = {
    skills: queryBuilder(overrides.skills ?? {
      data: [{
        id: skillId,
        code: "risk-based-test-design",
        labels: { en: "Risk-based test design", de: "Risikobasierter Testentwurf" },
        descriptions: { en: "Design focused tests." },
        taxonomy_version: 1,
      }],
      error: null,
    }),
    mastery: queryBuilder(overrides.mastery ?? {
      data: [{
        organization_id: organizationId,
        learner_id: learnerId,
        skill_id: skillId,
        mastery_basis_points: 8000,
        rule_version: 1,
        updated_at: "2026-07-18T12:00:00.000Z",
      }],
      error: null,
    }),
  };
  return {
    builders,
    from: vi.fn((table: string) => {
      if (table === "skills") return builders.skills;
      if (table === "mastery_snapshots") return builders.mastery;
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}

describe("readLearnerSkillCollection organization scope", () => {
  beforeEach(() => {
    vi.mocked(getPrincipal).mockReset();
    vi.mocked(createServerClient).mockReset();
  });

  it("qualifies both visible definitions and mastery by the active tenant", async () => {
    vi.mocked(getPrincipal).mockResolvedValue({
      userId: learnerId,
      organizationId,
      roles: ["learner"],
      permissions: [],
      cohortIds: [],
    } as never);
    const client = clientFixture();
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    const collection = await readLearnerSkillCollection("de");

    expect(client.builders.skills.or).toHaveBeenCalledWith(
      `organization_id.is.null,organization_id.eq.${organizationId}`,
    );
    expect(client.builders.mastery.eq).toHaveBeenNthCalledWith(
      1,
      "organization_id",
      organizationId,
    );
    expect(client.builders.mastery.eq).toHaveBeenNthCalledWith(
      2,
      "learner_id",
      learnerId,
    );
    expect(collection.skills[0]).toMatchObject({
      title: "Risikobasierter Testentwurf",
      mastery: { basisPoints: 8000 },
    });
  });

  it("fails before data reads without an organization-qualified learner", async () => {
    const client = clientFixture();
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    vi.mocked(getPrincipal).mockResolvedValue({
      userId: learnerId,
      organizationId: null,
      roles: ["learner"],
      permissions: [],
      cohortIds: [],
    } as never);

    await expect(readLearnerSkillCollection("en")).rejects.toThrow(
      "skills.forbidden",
    );
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("surfaces a tenant-qualified mastery read failure", async () => {
    vi.mocked(getPrincipal).mockResolvedValue({
      userId: learnerId,
      organizationId,
      roles: ["learner"],
      permissions: [],
      cohortIds: [],
    } as never);
    const client = clientFixture({
      mastery: { data: null, error: new Error("provider unavailable") },
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(readLearnerSkillCollection("en")).rejects.toThrow(
      "skills.learner_records_read_failed",
    );
  });
});
