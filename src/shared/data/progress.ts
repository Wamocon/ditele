import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { fromSupabase, ok, type Result } from "./result";

/**
 * WS-12 — the oversight data layer. `05_…` §G10, `06_…` §8 WS-12.
 *
 * ⭐ **This file is the single source of truth for progress numbers, for BOTH
 * the admin board and the trainer view.** That is the whole point of it.
 *
 * `06_…` §8 item 4: `trainer/progress` was rebuilt from `cohort_memberships`
 * because a trainer session reads 0 rows from `enrollments` (I-018). The
 * course-trainer migration fixed the policy, but the two screens still compute
 * from different tables — and two screens that are *supposed* to agree
 * eventually do not, at which point nobody trusts either number.
 *
 * So there is exactly one read, `public.list_progress_board`, and the database
 * scopes it by the caller's own role: an admin sees their organization, a
 * trainer sees the courses they hold in `course_trainers`. Same function, same
 * arithmetic, same definitions of "done" and "behind". They cannot disagree.
 *
 * ── Why an RPC and not table reads ────────────────────────────────────────
 *
 * No session on this deployment can read what this board needs
 * (`RPC_CONTRACTS.md` §10, `plan/status/WS-11.md`): an admin reads 0 rows from
 * `attempts` and `submissions`, a trainer reads 0 from `enrollments`, and the
 * three reward tables are self-read only so every non-learner reads 0 from all
 * of them. Assembling this in TypeScript from `.from()` calls would produce a
 * page full of zeroes that looks exactly like real data about idle learners.
 *
 * ── Every number here is PLAN-RELATIVE ────────────────────────────────────
 *
 * `06_…` §8 item 5. `dayIndex` counts from the learner's own
 * `enrollments.decided_at` in their own timezone, and `tasksExpected` resolves
 * `task_schedules.offset_days` against that same index. Two learners who
 * enrolled three weeks apart are each measured against their own plan, so
 * neither is "ahead" merely for having started earlier. **Nothing in this file
 * ranks learners against each other** — decision D4 defers the leaderboard, and
 * ranking by absolute XP would mean whoever enrolled first wins forever.
 */

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** The three signals of `06_…` §8 item 2. Order here is not significance. */
export type RiskSignal = "stalled" | "behind" | "stuck";

export const RISK_SIGNALS: readonly RiskSignal[] = ["stalled", "behind", "stuck"];

export interface ProgressRow {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  courseId: string;
  courseTitle: string;
  enrollmentState: string;
  /** Day N **of this learner's own plan**, 1-based. Never a cohort-wide day. */
  dayIndex: number;
  tasksDone: number;
  tasksTotal: number;
  /** How many tasks their own schedule says should be open by now. */
  tasksExpected: number;
  huntsTotal: number;
  openHunts: number;
  pendingFindings: number;
  totalXp: number;
  level: number;
  streakCurrent: number;
  streakLongest: number;
  /** Null ⇒ never started anything. Renders as "noch nie", not as "vor 0 Tagen". */
  lastActivityAt: string | null;
  /** Rejections on the single worst hunt — the `stuck` signal's evidence. */
  worstRejections: number;
  risks: RiskSignal[];
  /** Precomputed in SQL so the sort order cannot drift between callers. */
  riskScore: number;
}

/* ── Parsing ────────────────────────────────────────────────────────────── */

const RiskSignalSchema = z.enum(["stalled", "behind", "stuck"]);

const BoardRow = z.object({
  enrollment_id: z.string(),
  learner_id: z.string(),
  learner_name: z.string(),
  course_id: z.string(),
  course_title: z.string(),
  enrollment_state: z.string(),
  day_index: z.number(),
  tasks_done: z.number(),
  tasks_total: z.number(),
  tasks_expected: z.number(),
  hunts_total: z.number(),
  open_hunts: z.number(),
  pending_findings: z.number(),
  total_xp: z.number(),
  level: z.number(),
  streak_current: z.number(),
  streak_longest: z.number(),
  last_activity_at: z.string().nullable(),
  worst_rejections: z.number(),
  // An unknown signal is dropped rather than failing the row: a later
  // migration adding a fourth risk must not blank this screen.
  risks: z.array(z.string()),
  risk_score: z.number(),
});

const Board = z.array(BoardRow);

function toRow(raw: z.infer<typeof BoardRow>): ProgressRow {
  return {
    enrollmentId: raw.enrollment_id,
    learnerId: raw.learner_id,
    learnerName: raw.learner_name,
    courseId: raw.course_id,
    courseTitle: raw.course_title,
    enrollmentState: raw.enrollment_state,
    dayIndex: raw.day_index,
    tasksDone: raw.tasks_done,
    tasksTotal: raw.tasks_total,
    tasksExpected: raw.tasks_expected,
    huntsTotal: raw.hunts_total,
    openHunts: raw.open_hunts,
    pendingFindings: raw.pending_findings,
    totalXp: raw.total_xp,
    level: raw.level,
    streakCurrent: raw.streak_current,
    streakLongest: raw.streak_longest,
    lastActivityAt: raw.last_activity_at,
    worstRejections: raw.worst_rejections,
    risks: raw.risks.filter((signal): signal is RiskSignal =>
      RiskSignalSchema.safeParse(signal).success
    ),
    riskScore: raw.risk_score,
  };
}

/* ── Reads ──────────────────────────────────────────────────────────────── */

/**
 * The whole board, already sorted by risk. One row per active enrollment the
 * caller is allowed to see.
 *
 * ⚠️ **A shape we cannot parse is an ERROR, not an empty board.** Every other
 * degrade-to-empty in this codebase is safe because empty means "nothing to
 * show". Here empty means "no learner is at risk", which is a claim, and a
 * wrong one is the failure this whole screen exists to prevent. So a parse
 * failure surfaces `ErrorState` instead of a reassuring blank page.
 */
export async function listProgressBoard(locale: string): Promise<Result<ProgressRow[]>> {
  const supabase = await createServerClient();

  const result = await fromSupabase<unknown>(async () => {
    // ⚠️ The cast is a workaround, not a shortcut — same one WS-11 documented
    // as I-052. `database.types.ts` is generated by `npm run db:types`, which
    // shells out to `supabase gen types` and needs a Docker daemon this machine
    // does not have. The file is WS-0's and outside my tree, so
    // `list_progress_board` is absent from the generated RPC-name union and the
    // call will not compile without this. WS-13 regenerates; then delete it.
    const { data, error } = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: import("@supabase/supabase-js").PostgrestError | null;
      }>
    )("list_progress_board", { p_locale: locale });
    return { data, error };
  });

  if (!result.ok) return result;

  const parsed = Board.safeParse(result.data);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "SHAPE",
        message: "Die Fortschrittsdaten konnten nicht gelesen werden.",
        retryable: true,
      },
    };
  }

  return ok(parsed.data.map(toRow));
}

/**
 * The set of course ids that currently have at least one assigned trainer.
 *
 * ⚠️ This exists because of a failure found in a browser, not in review.
 * "Trainer benachrichtigen" on a course with no `course_trainers` row notifies
 * nobody — correctly, and the RPC says so. But the admin only found out *after*
 * writing the note, and on a course that has never been assigned a trainer that
 * is every single attempt. Knowing up front turns a wasted effort into a
 * different, actionable message.
 *
 * Read directly rather than folded into `list_progress_board`: an admin session
 * *can* read `course_trainers` (measured — it is not one of the tables §10 of
 * `RPC_CONTRACTS.md` blanks), so a second small query beats re-issuing a
 * 200-line `security definer` body in a third migration against a live
 * database.
 *
 * A failure here degrades to "assume a trainer exists". The notify RPC is still
 * the authority and still reports the truth, so the worst case is the message
 * an admin would have got anyway — never a flag that silently vanishes.
 */
export async function listCoursesWithTrainer(): Promise<Result<Set<string>>> {
  const supabase = await createServerClient();

  const result = await fromSupabase<{ course_id: string }[]>(async () => {
    // ⚠️ Another I-052 cast, and a wider one than expected: `course_trainers`
    // is missing from `database.types.ts` too. The table shipped in
    // `20260721130000_course_based_assignment.sql` and the generated types have
    // not been regenerated since — `npm run db:types` needs a Docker daemon
    // this machine does not have. So the table is unknown to the relation
    // union, exactly like WS-11's three objects. WS-13 regenerates; then the
    // cast comes out and this becomes a plain `.from()`.
    const { data, error } = await (
      supabase.from as unknown as (relation: string) => {
        select: (columns: string) => {
          is: (
            column: string,
            value: null
          ) => Promise<{
            data: { course_id: string }[] | null;
            error: import("@supabase/supabase-js").PostgrestError | null;
          }>;
        };
      }
    )("course_trainers")
      .select("course_id")
      .is("removed_at", null);
    return { data, error };
  });

  if (!result.ok) return result;
  return ok(new Set(result.data.map((row) => row.course_id)));
}
