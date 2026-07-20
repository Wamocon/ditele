import { describe, expect, it, vi } from "vitest";

import type { Portfolio, PortfolioPublication } from "@/features/portfolio/model/portfolio";
import {
  getLearnerPortfolio,
  getPublishedPortfolio,
  PortfolioError,
  publishPortfolio,
  revokePortfolioPublication,
  updatePortfolio,
  type PortfolioAccessPolicy,
  type PortfolioRepository,
} from "@/features/portfolio/server/portfolio-service";

const timestamp = "2026-07-18T08:00:00.000Z";
const token = "a".repeat(43);

const portfolio: Portfolio = {
  id: "portfolio-1",
  learnerId: "learner-1",
  title: "Verified QA evidence",
  summary: "Accepted practical work",
  version: 2,
  visibility: "private",
  items: [],
  updatedAt: timestamp,
};

const publication: PortfolioPublication = {
  id: "publication-1",
  portfolioId: portfolio.id,
  publicToken: token,
  status: "published",
  visibility: "unlisted",
  version: 1,
  publishedAt: timestamp,
  contentHash: "a".repeat(64),
  snapshot: { title: portfolio.title, summary: portfolio.summary, items: [] },
};

function dependencies(allowed = true) {
  const policy: PortfolioAccessPolicy = { canAccess: vi.fn(async () => allowed) };
  const repository: PortfolioRepository = {
    getForLearner: vi.fn(async () => portfolio),
    update: vi.fn(async () => ({ ...portfolio, version: 3, title: "Curated QA evidence" })),
    publish: vi.fn(async () => publication),
    revoke: vi.fn(async () => ({ ...publication, status: "revoked", version: 2, revokedAt: timestamp })),
    getPublishedByToken: vi.fn(async () => publication),
  };
  return { policy, repository };
}

describe("portfolio authorization and publication boundaries", () => {
  it("requires a learner session before attempting any repository access", async () => {
    const first = dependencies();
    await expect(getLearnerPortfolio(first, null, portfolio.id)).rejects.toEqual(
      new PortfolioError("portfolio.authentication_required"),
    );
    expect(first.policy.canAccess).not.toHaveBeenCalled();

    const second = dependencies();
    await expect(
      getLearnerPortfolio(second, { id: "trainer-1", role: "trainer" }, portfolio.id),
    ).rejects.toEqual(new PortfolioError("portfolio.forbidden"));
    expect(second.policy.canAccess).not.toHaveBeenCalled();
  });

  it("scopes learner reads and validates the repository projection", async () => {
    const suite = dependencies();
    await expect(
      getLearnerPortfolio(suite, { id: "learner-1", role: "learner" }, portfolio.id),
    ).resolves.toEqual(portfolio);
    expect(suite.policy.canAccess).toHaveBeenCalledWith({
      actorId: "learner-1",
      portfolioId: portfolio.id,
      action: "read",
    });
    expect(suite.repository.getForLearner).toHaveBeenCalledWith({
      learnerId: "learner-1",
      portfolioId: portfolio.id,
    });

    vi.mocked(suite.repository.getForLearner).mockResolvedValueOnce({ id: 7 });
    await expect(
      getLearnerPortfolio(suite, { id: "learner-1", role: "learner" }, portfolio.id),
    ).rejects.toThrow();
  });

  it("passes validated update commands with actor-derived learner ownership", async () => {
    const suite = dependencies();
    await expect(
      updatePortfolio(
        suite,
        { id: "learner-1", role: "learner" },
        {
          portfolioId: portfolio.id,
          title: "Curated QA evidence",
          summary: portfolio.summary,
          items: [],
          expectedVersion: 2,
          idempotencyKey: "portfolio-update-0001",
        },
      ),
    ).resolves.toMatchObject({ title: "Curated QA evidence", version: 3 });
    expect(suite.policy.canAccess).toHaveBeenCalledWith({
      actorId: "learner-1",
      portfolioId: portfolio.id,
      action: "curate",
    });
    expect(suite.repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ learnerId: "learner-1", expectedVersion: 2 }),
    );
  });

  it("publishes and revokes only after action-specific policy checks", async () => {
    const suite = dependencies();
    await expect(
      publishPortfolio(
        suite,
        { id: "learner-1", role: "learner" },
        {
          portfolioId: portfolio.id,
          visibility: "unlisted",
          expectedVersion: 2,
          idempotencyKey: "portfolio-publish-0001",
        },
      ),
    ).resolves.toEqual(publication);
    expect(suite.policy.canAccess).toHaveBeenCalledWith({
      actorId: "learner-1",
      portfolioId: portfolio.id,
      action: "publish",
    });

    await expect(
      revokePortfolioPublication(
        suite,
        { id: "learner-1", role: "learner" },
        {
          publicationId: publication.id,
          expectedVersion: 1,
          idempotencyKey: "portfolio-revoke-0001",
        },
      ),
    ).resolves.toMatchObject({ status: "revoked", version: 2 });
    expect(suite.policy.canAccess).toHaveBeenCalledWith({
      actorId: "learner-1",
      publicationId: publication.id,
      action: "revoke",
    });
  });

  it("fails closed on denied publish access before invoking persistence", async () => {
    const suite = dependencies(false);
    await expect(
      publishPortfolio(
        suite,
        { id: "learner-1", role: "learner" },
        {
          portfolioId: portfolio.id,
          visibility: "public",
          expectedVersion: 2,
          idempotencyKey: "portfolio-publish-0002",
        },
      ),
    ).rejects.toEqual(new PortfolioError("portfolio.forbidden"));
    expect(suite.repository.publish).not.toHaveBeenCalled();
  });

  it("rejects malformed, revoked, and adapter-invalid public publications", async () => {
    const suite = dependencies();
    await expect(getPublishedPortfolio(suite.repository, "short-token")).rejects.toEqual(
      new PortfolioError("portfolio.publication_not_found"),
    );
    expect(suite.repository.getPublishedByToken).not.toHaveBeenCalled();

    vi.mocked(suite.repository.getPublishedByToken).mockResolvedValueOnce({
      ...publication,
      status: "revoked",
      revokedAt: timestamp,
    });
    await expect(getPublishedPortfolio(suite.repository, token)).rejects.toEqual(
      new PortfolioError("portfolio.publication_not_found"),
    );

    vi.mocked(suite.repository.getPublishedByToken).mockResolvedValueOnce({ id: 9 });
    await expect(getPublishedPortfolio(suite.repository, token)).rejects.toThrow();
  });

  it("returns a schema-validated published snapshot for a valid public token", async () => {
    const suite = dependencies();
    await expect(getPublishedPortfolio(suite.repository, token)).resolves.toEqual(publication);
    expect(suite.repository.getPublishedByToken).toHaveBeenCalledWith(token);
  });
});
