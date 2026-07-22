"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/shared/auth/guard";
import { createServerClient } from "@/shared/database/server";
import { adminStrings } from "@/features/content/i18n";
import type { ActionState } from "@/features/admin/action-state";

/**
 * Arena scenario authoring — the two commands that had no caller.
 *
 * ⚠️ Layer 2 of three (MASTER_PLAN §9.3). The `(admin)` layout guard stops a
 * *render*, not a POST. Both RPCs re-check `content.manage` in the database.
 *
 * ⚠️ `"use server"` modules may only export async functions; every constant and
 * type stays in `@/features/admin/action-state`.
 *
 * The HTML is NOT sanitised here. `app_private.sanitize_scenario_html` does it
 * inside `upsert_hunt_scenario`, so the rule lives in one place and cannot
 * drift — and the sandbox attribute, not the sanitiser, is the control
 * (FEATURE_BUILD_PLAN §2.1). Sanitising a second time in TypeScript would give
 * two implementations of one rule and a false sense that the client-side one
 * matters.
 */

const Code = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const Defect = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  location_hint: z.string().trim(),
  expected_behaviour: z.string().trim(),
  reproduction: z.string().trim(),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

/** Blank-but-present rows are dropped rather than rejected: an author who adds
 *  a row and changes their mind should not have to delete it to save. */
function readDefects(formData: FormData) {
  const codes = formData.getAll("defectCode").map(String);
  const titles = formData.getAll("defectTitle").map(String);
  const locations = formData.getAll("defectLocation").map(String);
  const expected = formData.getAll("defectExpected").map(String);
  const reproduction = formData.getAll("defectReproduction").map(String);
  const severities = formData.getAll("defectSeverity").map(String);

  const rows: unknown[] = [];
  for (let index = 0; index < codes.length; index += 1) {
    const code = (codes[index] ?? "").trim();
    const title = (titles[index] ?? "").trim();
    if (code === "" && title === "") continue;
    rows.push({
      code,
      title,
      location_hint: (locations[index] ?? "").trim(),
      expected_behaviour: (expected[index] ?? "").trim(),
      reproduction: (reproduction[index] ?? "").trim(),
      severity: (severities[index] ?? "medium").trim(),
    });
  }
  return rows;
}

export async function saveScenarioAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const s = adminStrings(locale).arena;

  const code = Code.safeParse(formData.get("code"));
  if (!code.success) return { status: "error", message: s.codeInvalid };

  const title = String(formData.get("title") ?? "").trim();
  if (title === "") return { status: "error", message: s.titleRequired };

  const rawDefects = readDefects(formData);
  const defects = z.array(Defect).safeParse(rawDefects);
  if (!defects.success) return { status: "error", message: s.defectCodeInvalid };

  // Two codes that differ only by case would collide on
  // `hunt_scenario_defects_code_unique` inside the transaction and surface as a
  // raw 23505; caught here so the author gets a sentence instead.
  const seen = new Set<string>();
  for (const defect of defects.data) {
    if (seen.has(defect.code)) return { status: "error", message: s.defectCodeInvalid };
    seen.add(defect.code);
  }

  const html = String(formData.get("html") ?? "").trim();
  const state = String(formData.get("state") ?? "draft");

  // The badge is optional, and "" from the picker's empty option means "no
  // badge" — which must be sent as an explicit null, not omitted. Omitting it
  // would let the function's own default stand and an author could attach a
  // badge but never take one off. The RPC assigns it unconditionally for the
  // same reason.
  const rewardBadgeRaw = String(formData.get("rewardBadgeId") ?? "").trim();
  const rewardBadgeId = rewardBadgeRaw === "" ? null : rewardBadgeRaw;
  if (rewardBadgeId !== null && !z.string().uuid().safeParse(rewardBadgeId).success) {
    return { status: "error", message: s.badgeInvalid };
  }

  try {
    const supabase = await createServerClient();
    const { data: scenario, error } = await supabase.rpc("upsert_hunt_scenario", {
      p_code: code.data,
      p_title: title,
      p_description: String(formData.get("description") ?? "").trim(),
      // Spread-in rather than pass-undefined. `exactOptionalPropertyTypes` is
      // on, so an explicit `undefined` is not the same as an absent key — and
      // PostgREST treats them differently too: a null argument overwrites the
      // column, while an absent one lets the function's own default stand.
      ...(html === "" ? {} : { p_html: html }),
      p_reward_badge_id: rewardBadgeId,
      p_state: state as "draft" | "active" | "inactive" | "archived",
    });
    if (error) return { status: "error", message: s.saveFailed };

    // `expected_findings` is derived from the list by the command, so the
    // defects must be written even when the array is empty — otherwise a
    // scenario keeps a count from a list it no longer has.
    const scenarioId = (scenario as { id?: unknown } | null)?.id;
    if (typeof scenarioId === "string") {
      const { error: defectError } = await supabase.rpc("set_hunt_scenario_defects", {
        p_scenario_id: scenarioId,
        p_defects: defects.data,
      });
      if (defectError) return { status: "error", message: s.saveFailed };
    }

    revalidatePath(`/${locale}/admin/arena`);
    return { status: "success", message: s.saved };
  } catch {
    return { status: "error", message: s.saveFailed };
  }
}
