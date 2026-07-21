import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { fromSupabase, ok, type Result } from "@/shared/data/result";
import { huntPrerequisite, huntTaskHref, type LockReason } from "@/features/arena/model";
import {
  levelForXp,
  type BadgeAward,
  type Celebration,
  type LevelStanding,
  type Streak,
  type XpEntry,
} from "./model";

/**
 * Reward data access.
 *
 * **Reads only.** Every write in this feature happens inside a database
 * transaction the learner does not control — the award engine runs inside the
 * trainer's review decision (`20260725100000`), and the streak refresh runs
 * inside `get_my_arena_summary` (`20260725200000`). There is deliberately no
 * "give me XP" call reachable from a page: `05_…` §G5 makes XP-on-acceptance a
 * guard rail, and a client-callable award RPC would be a way around it.
 *
 * Three constraints inherited from the rest of the data layer, each learned the
 * hard way and each still true here:
 *
 *  * **Never `.from(x).insert()`** (I-003). `xp_ledger` and `badge_awards` have
 *    a self-*read* policy and no insert policy at all, so a direct write
 *    compiles perfectly and 42501s at runtime on a user action.
 *  * **RLS returns `[]`, not an error, when you may not see something**
 *    (`RPC_CONTRACTS.md` §10). Everything here is scoped to `auth.uid()` by the
 *    shipped `xp_ledger_self_read` / `badge_awards_self_read` policies, so an
 *    empty list genuinely means "nothing yet" — but only because those policies
 *    are keyed on the caller, which is worth stating rather than assuming.
 *  * **Never send a stale expected version** (I-007 / I-009) — a stale one
 *    HANGS on this deployment rather than erroring, and poisons the PostgREST
 *    pool for ~30 s. Nothing here sends one; `dismissCelebration` reads the row
 *    version immediately before the call that uses it.
 */

/* ── Rows ─────────────────────────────────────────────────────────────────── */

const XpRow = z.object({
  id: z.string(),
  points: z.number(),
  source_kind: z.string(),
  rationale: z.string(),
  awarded_at: z.string(),
});

const BadgeAwardRow = z.object({
  awarded_at: z.string(),
  badges: z
    .object({
      code: z.string(),
      labels: z.unknown(),
      descriptions: z.unknown(),
    })
    .nullable(),
});

/**
 * `badges.labels` is a `{de,en,ru}` jsonb, like `skills` and unlike the hunt
 * scenario's German-only prose — a badge name is interface chrome, not course
 * material. Resolve with the same fallback chain `RPC_CONTRACTS.md` §0.2
 * prescribes: a locale key can be absent *or* present and empty.
 */
function pickLocalized(value: unknown, locale: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const map = value as Record<string, unknown>;
  for (const key of [locale, "de", "en"]) {
    const candidate = map[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  const first = Object.values(map).find((v) => typeof v === "string" && v.trim() !== "");
  return typeof first === "string" ? first : "";
}

/**
 * `rationale` is written by the award engine as `"<rule_code>: <prose>"`, so the
 * UI can label an entry with a translated rule name instead of the German
 * sentence the database stored. A row that predates that convention, or one
 * written by hand, falls back to showing its rationale verbatim.
 */
function splitRationale(rationale: string): { ruleCode: string; text: string } {
  const separator = rationale.indexOf(": ");
  if (separator <= 0) return { ruleCode: "", text: rationale };
  const code = rationale.slice(0, separator);
  if (!/^[a-z0-9_]+$/.test(code)) return { ruleCode: "", text: rationale };
  return { ruleCode: code, text: rationale.slice(separator + 2) };
}

/* ── XP ───────────────────────────────────────────────────────────────────── */

export interface XpStanding {
  standing: LevelStanding;
  recent: XpEntry[];
}

/**
 * Total XP and the most recent entries, in one round trip.
 *
 * The total is summed in the application rather than by the database because
 * PostgREST cannot aggregate without a view, and adding one would put a new
 * object in a schema WS-11 shares with four other workstreams for a sum over a
 * table that holds tens of rows per learner. If a learner ever accrues enough
 * entries for that to matter, the right fix is a `mastery_snapshots`-shaped
 * running total, not a view.
 */
export async function getXpStanding(limit = 8): Promise<Result<XpStanding>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("xp_ledger")
      .select("id, points, source_kind, rationale, awarded_at")
      .order("awarded_at", { ascending: false });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  let totalXp = 0;
  const recent: XpEntry[] = [];
  for (const row of result.data) {
    const parsed = XpRow.safeParse(row);
    // Skip a malformed row rather than blanking the page. One bad ledger entry
    // must not cost a learner the sight of their whole standing.
    if (!parsed.success) continue;
    totalXp += parsed.data.points;
    if (recent.length < limit) {
      const { ruleCode, text } = splitRationale(parsed.data.rationale);
      recent.push({
        id: parsed.data.id,
        points: parsed.data.points,
        ruleCode,
        sourceKind: parsed.data.source_kind,
        rationale: text,
        awardedAt: parsed.data.awarded_at,
      });
    }
  }

  return ok({ standing: levelForXp(totalXp), recent });
}

/* ── Badges ───────────────────────────────────────────────────────────────── */

/** Every badge the learner holds, newest first. */
export async function listMyBadges(locale: string): Promise<Result<BadgeAward[]>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("badge_awards")
      .select("awarded_at, badges ( code, labels, descriptions )")
      .order("awarded_at", { ascending: false });
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;

  const badges: BadgeAward[] = [];
  for (const row of result.data) {
    const parsed = BadgeAwardRow.safeParse(row);
    if (!parsed.success || !parsed.data.badges) continue;
    badges.push({
      code: parsed.data.badges.code,
      label: pickLocalized(parsed.data.badges.labels, locale) || parsed.data.badges.code,
      description: pickLocalized(parsed.data.badges.descriptions, locale),
      awardedAt: parsed.data.awarded_at,
    });
  }
  return ok(badges);
}

/* ── Hunts ────────────────────────────────────────────────────────────────── */

export interface OpenHunt {
  taskId: string;
  title: string;
  /** The task this hunt unlocks — the reason to play it. */
  unlocksTitle: string;
  href: string;
}

const CourseListRow = z.object({ course_id: z.string() });

/**
 * The hunts standing between the learner and a locked task.
 *
 * This is `05_…` §G8 read from the other end: instead of asking "why is this
 * task locked", it asks "what should I play next", and both answers come from
 * the same enriched `required_task` lock reason WS-8 added. Nothing here reads
 * `tasks` — a learner reads zero rows from that table (`RPC_CONTRACTS.md` §10)
 * — so every title comes from the learner's own published-content projection,
 * which is what keeps the deep link free of a content leak.
 *
 * Costs one `get_my_learning_course` call per enrolled course. That is two
 * round trips at today's scale and would need rethinking at twenty courses; it
 * is not worth a bespoke RPC before then.
 */
export async function listOpenHunts(locale: string): Promise<Result<OpenHunt[]>> {
  const supabase = await createServerClient();

  const courses = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase.rpc("list_my_learning_courses", { p_locale: locale });
    return { data: data as unknown[] | null, error };
  });
  if (!courses.ok) return courses;

  const seen = new Set<string>();
  const hunts: OpenHunt[] = [];

  for (const courseRow of courses.data) {
    const parsedCourse = CourseListRow.safeParse(courseRow);
    if (!parsedCourse.success) continue;

    const detail = await fromSupabase<unknown>(async () => {
      const { data, error } = await supabase.rpc("get_my_learning_course", {
        p_course_id: parsedCourse.data.course_id,
        p_locale: locale,
      });
      return { data: data as unknown, error };
    });
    // One unreadable course must not hide the hunts in the others.
    if (!detail.ok) continue;

    for (const activity of activitiesOf(detail.data)) {
      const reason: LockReason | null = huntPrerequisite(activity.lock_reasons);
      if (!reason?.requiredTaskId || seen.has(reason.requiredTaskId)) continue;
      seen.add(reason.requiredTaskId);
      hunts.push({
        taskId: reason.requiredTaskId,
        title: reason.requiredTaskTitle ?? "",
        unlocksTitle: activity.title,
        href: huntTaskHref(locale, reason.requiredTaskId),
      });
    }
  }

  return ok(hunts);
}

interface Activity {
  title: string;
  lock_reasons: unknown;
}

/** Walks `get_my_learning_course`'s stages → activities without trusting either. */
function activitiesOf(course: unknown): Activity[] {
  if (!course || typeof course !== "object") return [];
  const stages = (course as { stages?: unknown }).stages;
  if (!Array.isArray(stages)) return [];

  const out: Activity[] = [];
  for (const stage of stages) {
    const activities = (stage as { activities?: unknown })?.activities;
    if (!Array.isArray(activities)) continue;
    for (const activity of activities) {
      if (!activity || typeof activity !== "object") continue;
      const title = (activity as { title?: unknown }).title;
      out.push({
        title: typeof title === "string" ? title : "",
        lock_reasons: (activity as { lock_reasons?: unknown }).lock_reasons,
      });
    }
  }
  return out;
}

/**
 * Hunt reports filed and still waiting on a trainer.
 *
 * This is the number that must never be confused with XP: a pending finding is
 * worth nothing yet, and saying so on the hub is what makes "XP on acceptance,
 * never on submission" visible to the learner rather than merely true in the
 * database.
 */
export async function countPendingHuntFindings(): Promise<Result<number>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase
      .from("hunt_findings")
      .select("id")
      .eq("verdict", "pending");
    return { data: data as unknown[] | null, error };
  });
  if (!result.ok) return result;
  return ok(result.data.length);
}

/* ── Streak + celebrations ────────────────────────────────────────────────── */

const SummaryRow = z.object({
  total_xp: z.number(),
  level: z.number(),
  streak: z
    .object({
      current_length: z.number(),
      longest_length: z.number(),
      last_activity_date: z.string().nullable(),
      freezes_remaining: z.number(),
      active_today: z.boolean().nullable(),
    })
    .nullable(),
  celebrations: z.array(
    z.object({
      notification_id: z.string(),
      row_version: z.number(),
      kind: z.string(),
      reference: z.string(),
      label: z.string(),
    }),
  ),
});

export interface ArenaSummaryRead {
  streak: Streak | null;
  celebrations: Celebration[];
}

/**
 * The hub's one call to `get_my_arena_summary`.
 *
 * ⚠️ **This read writes.** The RPC refreshes the learner's streak before it
 * answers, because the streak is derived from real activity dates rather than
 * incremented by a job, and the Arena hub is the place a learner reliably
 * passes through. Splitting it into "refresh, then read" would be two round
 * trips and a state where one succeeded and the other did not.
 *
 * It returns `streak: null` for a learner with no approved enrollment — a real
 * state on this deployment, not an error, since a learner can hold an account
 * before their enrolment is decided.
 */
export async function getArenaSummary(): Promise<Result<ArenaSummaryRead>> {
  const supabase = await createServerClient();
  const result = await fromSupabase<unknown>(async () => {
    // WS-11 shipped this as an untyped cast (I-052) because the RPC was absent
    // from the generated union and it did not own `database.types.ts`. WS-13
    // added the entry by hand, so this is a plain, name-checked call again.
    const { data, error } = await supabase.rpc("get_my_arena_summary");
    return { data, error };
  });
  if (!result.ok) return result;

  const parsed = SummaryRow.safeParse(result.data);
  // A shape we do not recognise degrades to "no streak yet" rather than taking
  // the hub down. The XP and badge sections read their own tables and are
  // unaffected either way.
  if (!parsed.success) return ok({ streak: null, celebrations: [] });

  const streakRow = parsed.data.streak;
  return ok({
    streak: streakRow
      ? {
          currentLength: streakRow.current_length,
          longestLength: streakRow.longest_length,
          lastActivityDate: streakRow.last_activity_date,
          freezesRemaining: streakRow.freezes_remaining,
          activeToday: streakRow.active_today === true,
        }
      : null,
    celebrations: parsed.data.celebrations.map((row) => ({
      notificationId: row.notification_id,
      rowVersion: row.row_version,
      kind: row.kind === "level" ? "level" : "badge",
      reference: row.reference,
      label: row.label,
    })),
  });
}
