"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/shared/auth/guard";
import { createServerClient } from "@/shared/database/server";
import { getAdminDict } from "@/features/admin/i18n";
import type { ActionState } from "@/features/admin/action-state";

/**
 * WS-12 — the board's only write.
 *
 * ⚠️ Layer 2 of three (MASTER_PLAN §9.3). The `(admin)` layout guard stops a
 * *render*; it does not protect a POST. This re-checks the role, and
 * `flag_learner_to_trainer` re-checks it again in the database with
 * `app_private.has_role` — which is the boundary that actually holds, because
 * the RPC is `security definer` and nothing else stands between a caller and
 * another user's notification feed.
 *
 * ⚠️ This module is `"use server"`, so it may only export async functions. A
 * non-function export is stripped rather than rejected, and the import then
 * resolves to `undefined` and crashes at render with an unrelated-looking
 * message (`src/features/admin/action-state.ts` documents the same trap).
 */

const FlagInput = z.object({
  enrollmentId: z.string().uuid(),
  note: z.string().trim().min(1).max(1000),
});

const FlagResult = z.object({
  notified: z.number(),
  trainers: z.number(),
  repeated: z.boolean(),
});

export async function flagLearnerAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);

  const locale = String(formData.get("locale") ?? "de");
  const dict = await getAdminDict(locale);
  const p = dict.progress;

  const input = FlagInput.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    note: formData.get("note"),
  });
  if (!input.success) {
    return { status: "error", message: p.notifyNoteRequired };
  }

  try {
    const supabase = await createServerClient();
    // I-052's cast is gone: WS-13 hand-added `flag_learner_to_trainer` to
    // `database.types.ts`, so this call is name- and argument-checked again.
    const { data, error } = await supabase.rpc("flag_learner_to_trainer", {
      p_enrollment_id: input.data.enrollmentId,
      p_note: input.data.note,
      p_correlation_id: crypto.randomUUID(),
    });

    if (error) return { status: "error", message: p.notifyFailed };

    const parsed = FlagResult.safeParse(data);
    if (!parsed.success) return { status: "error", message: p.notifyFailed };

    // Three genuinely different outcomes, and collapsing them into one
    // "gesendet" would be a lie in two of the cases. A course with no trainer
    // is the one worth surfacing loudest: the notification went nowhere and the
    // admin would otherwise assume someone is now looking at that learner.
    if (parsed.data.trainers === 0) {
      return { status: "error", message: p.notifyNoTrainer };
    }
    if (parsed.data.repeated) {
      return { status: "success", message: p.notifyRepeat };
    }

    revalidatePath(`/${locale}/admin/progress`);
    return { status: "success", message: p.notifySuccess };
  } catch {
    return { status: "error", message: p.notifyFailed };
  }
}
