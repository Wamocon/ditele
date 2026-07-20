import "server-only";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import {
  buildLearnerPortfolioRecord,
  type LearnerPortfolioRecord,
} from "@/features/portfolio/model/learner-portfolio-record";
import { createServerClient } from "@/shared/database/server";

export async function readLearnerPortfolioRecord(): Promise<LearnerPortfolioRecord | null> {
  const [principal, client] = await Promise.all([
    getPrincipal(),
    createServerClient(),
  ]);
  const portfolioResult = await client
    .from("portfolios")
    .select(
      "id, learner_id, title, summary, visibility, row_version, updated_at",
    )
    .eq("learner_id", principal.userId)
    .maybeSingle();

  if (portfolioResult.error) {
    throw new Error("portfolio.learner_record_read_failed", {
      cause: portfolioResult.error,
    });
  }
  if (!portfolioResult.data) return null;

  const itemResult = await client
    .from("portfolio_items")
    .select(
      "id, evidence_id, position, reflection, created_at, evidence(id, evidence_kind, title, captured_at, validation_results(outcome, validated_at))",
    )
    .eq("portfolio_id", portfolioResult.data.id)
    .order("position", { ascending: true });

  if (itemResult.error) {
    throw new Error("portfolio.learner_items_read_failed", {
      cause: itemResult.error,
    });
  }

  return buildLearnerPortfolioRecord(
    portfolioResult.data,
    itemResult.data ?? [],
  );
}
