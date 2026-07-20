import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/shared/database/database.types";

const activeTrainerRowSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(200),
});

export type ActiveTrainerCandidate = {
  readonly id: string;
  readonly name: string;
};

function projectTrainerCandidates(
  data: unknown,
  currentUserId: string,
): readonly ActiveTrainerCandidate[] {
  return activeTrainerRowSchema
    .array()
    .parse(data)
    .filter((trainer) => trainer.user_id !== currentUserId)
    .map((trainer) => ({ id: trainer.user_id, name: trainer.display_name }));
}

/**
 * Reads the minimal actor-scoped trainer projection exposed by the database.
 * Eligibility is derived inside the RPC from active tenant, role, permission,
 * profile and cohort membership records; browser-provided role data is never
 * used for this decision.
 */
export async function readActiveCohortTrainers(
  client: SupabaseClient<Database>,
  cohortId: string,
  currentUserId: string,
): Promise<readonly ActiveTrainerCandidate[]> {
  const parsedCohortId = z.string().uuid().parse(cohortId);
  const parsedCurrentUserId = z.string().uuid().parse(currentUserId);
  const { data, error } = await client.rpc("list_active_cohort_trainers", {
    p_cohort_id: parsedCohortId,
  });
  if (error) {
    throw new Error("cohorts.active_trainers_read_failed", { cause: error });
  }

  return projectTrainerCandidates(data, parsedCurrentUserId);
}

/**
 * Reads trainers who can own question work. This is intentionally narrower
 * than submission-review eligibility and requires question.manage in the
 * actor-derived database projection.
 */
export async function readActiveQuestionTrainers(
  client: SupabaseClient<Database>,
  cohortId: string,
  currentUserId: string,
): Promise<readonly ActiveTrainerCandidate[]> {
  const parsedCohortId = z.string().uuid().parse(cohortId);
  const parsedCurrentUserId = z.string().uuid().parse(currentUserId);
  const { data, error } = await client.rpc("list_active_question_trainers", {
    p_cohort_id: parsedCohortId,
  });
  if (error) {
    throw new Error("cohorts.active_question_trainers_read_failed", {
      cause: error,
    });
  }

  return projectTrainerCandidates(data, parsedCurrentUserId);
}
