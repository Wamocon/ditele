import { describe, expect, it, vi } from "vitest";

import {
  PortfolioError,
  updatePortfolio,
  type PortfolioAccessPolicy,
  type PortfolioRepository,
} from "./portfolio-service";

describe("portfolio service", () => {
  it("does not permit another learner to curate a portfolio", async () => {
    const repository: PortfolioRepository = {
      getForLearner: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      revoke: vi.fn(),
      getPublishedByToken: vi.fn(),
    };
    const policy: PortfolioAccessPolicy = { canAccess: vi.fn(async () => false) };

    await expect(
      updatePortfolio(
        { policy, repository },
        { id: "learner-2", role: "learner" },
        {
          portfolioId: "portfolio-1",
          title: "My evidence",
          summary: "",
          items: [],
          expectedVersion: 1,
          idempotencyKey: "portfolio-key-0001",
        },
      ),
    ).rejects.toEqual(new PortfolioError("portfolio.forbidden"));
    expect(repository.update).not.toHaveBeenCalled();
  });
});
