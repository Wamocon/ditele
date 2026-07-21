/**
 * The ticket's label taxonomy — the Jira "Labels" field (05_… §G3+G4).
 *
 * **Why a constant and not a query.** The design says labels come from
 * `bug_categories`, and they do: this list is the canonical set, and migration
 * `20260724100000` seeds exactly these codes into that table so a trainer
 * screen, an export or a future analytics join has real rows to join against.
 * What the *form* must not do is read the table, for two measured reasons:
 *
 *  1. `bug_categories` has no read policy at all — its only policy is
 *     `bug_categories_content_write`, gated on `content.manage`. A learner
 *     therefore reads zero rows, and RLS returns `[]` rather than an error, so
 *     the picker would render empty and look like "no labels exist" instead of
 *     "you may not see these" (the failure mode ISSUES.md I-003 warns about).
 *  2. `DefectForm` is a Client Component rendered by `task-workspace.tsx`,
 *     which WS-10 does not own and cannot make pass a new prop. A list that
 *     has to arrive from the server cannot get there.
 *
 * So the codes are frozen here and mirrored into the database, rather than the
 * other way round. Adding a sixth label is one entry here, one `de.json` key
 * and one seeded row — no schema change.
 *
 * No server imports: the same split, and the same reason, as
 * `features/arena/model.ts`.
 */

/**
 * `functional` already exists on the live database as a global row. The other
 * four are seeded by WS-10's migration to match the design's list.
 */
export const BUG_LABEL_CODES = [
  "functional",
  "ui",
  "data",
  "performance",
  "accessibility",
] as const;

export type BugLabelCode = (typeof BUG_LABEL_CODES)[number];

/**
 * The `learn.task.*` key carrying each label's German name. Interface text, so
 * it is translatable to en/ru — unlike the scenario text a learner reads as
 * course material, which is German only (`CONTENT_LOCALES === ["de"]`).
 */
export const BUG_LABEL_STRING_KEYS: Record<BugLabelCode, string> = {
  functional: "defectLabelFunctional",
  ui: "defectLabelUi",
  data: "defectLabelData",
  performance: "defectLabelPerformance",
  accessibility: "defectLabelAccessibility",
};

/** Keeps a draft written before a code was retired from rendering as garbage. */
export function isKnownLabel(code: string): code is BugLabelCode {
  return (BUG_LABEL_CODES as readonly string[]).includes(code);
}

/**
 * The label's display name, or the raw code when a draft carries something this
 * build does not know about. Showing the code beats showing nothing: a trainer
 * can still act on `payment-flow`, but not on an empty chip.
 */
export function labelName(code: string, strings: Record<string, unknown>): string {
  if (!isKnownLabel(code)) return code;
  const value = strings[BUG_LABEL_STRING_KEYS[code]];
  return typeof value === "string" && value.length > 0 ? value : code;
}
