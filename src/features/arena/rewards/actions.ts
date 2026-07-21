"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/shared/database/server";

/**
 * Dismissing a celebration.
 *
 * There is exactly one action in this feature, and it is deliberately the only
 * write a learner can reach. `05_…` §G5 makes XP-on-trainer-acceptance a guard
 * rail rather than a convention, so nothing here — and nothing anywhere in
 * `features/arena/rewards/` — exposes a way to award, adjust or refresh XP from
 * a page. The award engine is `app_private`, revoked from every session role.
 *
 * Marking a celebration seen is the shipped `mark_notification_read` RPC. That
 * is the whole point of celebrating an unread notification instead of inventing
 * a "celebrated" column: the dismissal path already existed, already audits,
 * and already handles the concurrent case.
 */
export async function dismissCelebration(
  notificationId: string,
  rowVersion: number,
): Promise<void> {
  const supabase = await createServerClient();

  // ⚠️ `rowVersion` is read by `get_my_arena_summary` in the same render that
  // produced this button, so it is fresh by construction. It matters that it is:
  // a STALE `p_expected_version` does not return a conflict on this deployment —
  // it HANGS, Kong 504s, and the PostgREST pool is unusable for ~30 s afterwards
  // (ISSUES I-007 / I-009). Never re-use one across a navigation.
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
    p_expected_version: rowVersion,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: `arena-celebration-${notificationId}`,
  });

  // Swallowed on purpose, and this is the one place swallowing is right: the
  // reward itself is not in doubt, only whether the learner has seen the
  // banner. A failed dismissal leaves the notification unread, so the
  // celebration simply returns on the next load — which is a better outcome
  // than an error screen over a piece of confetti.
  if (error) {
    console.error("dismissCelebration", error);
    return;
  }

  revalidatePath("/[locale]/learn/arena", "page");
}
