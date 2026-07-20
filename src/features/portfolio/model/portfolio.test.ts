import { describe, expect, it } from "vitest";

import { PortfolioPublicationSchema, PublishPortfolioInputSchema } from "./portfolio";

describe("portfolio publication contracts", () => {
  it("never permits a private publication command", () => {
    expect(() =>
      PublishPortfolioInputSchema.parse({
        portfolioId: "portfolio-1",
        visibility: "private",
        expectedVersion: 1,
        idempotencyKey: "portfolio-key-0001",
      }),
    ).toThrow();
  });

  it("requires an opaque public token and immutable content hash", () => {
    expect(() =>
      PortfolioPublicationSchema.parse({
        id: "publication-1",
        portfolioId: "portfolio-1",
        publicToken: "guessable",
        status: "published",
        visibility: "unlisted",
        version: 1,
        publishedAt: "2026-07-17T08:00:00.000Z",
        contentHash: "short",
        snapshot: { title: "Portfolio", summary: "", items: [] },
      }),
    ).toThrow();
  });
});
