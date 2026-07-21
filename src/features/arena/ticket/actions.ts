"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import type { Result } from "@/shared/data/result";
import type { HuntVerdict } from "@/features/arena/model";
import { decideHuntFinding, type HuntTicket } from "./data";

/**
 * The trainer's verdict on one reported defect.
 *
 * The role check here is **not** the security boundary — it is the cheap first
 * one. `decide_hunt_finding` re-checks server-side with exactly the pair of
 * checks `decide_submission` makes (`is_active_cohort_review_trainer` or
 * `cohort.manage`), and that check cannot be skipped by a forged POST. This
 * layer exists because a layout guard does not protect a POST (MASTER_PLAN
 * §9.3), so failing fast here saves a round trip and returns a German message
 * instead of a raw Postgres error.
 *
 * Admins are included because `cohort.manage` admits them at the database
 * level; excluding them here would produce a UI that refuses what the database
 * would have allowed.
 */
export async function decideHuntFindingAction(input: {
  locale: string;
  submissionId: string;
  findingId: string;
  verdict: HuntVerdict;
  plantedCode: string | null;
  expectedVersion: number;
}): Promise<Result<HuntTicket | null>> {
  await requireRole(["trainer", "admin"], input.locale);

  const result = await decideHuntFinding({
    findingId: input.findingId,
    verdict: input.verdict,
    plantedCode: input.plantedCode,
    expectedVersion: input.expectedVersion,
  });

  if (result.ok) {
    // The review screen shows the verdict and the "n of m found" line, both of
    // which this changes. Revalidate the detail route only — the queue is not
    // affected, because a finding verdict is not a submission decision.
    revalidatePath(`/${input.locale}/trainer/submissions/${input.submissionId}`);
  }
  return result;
}
