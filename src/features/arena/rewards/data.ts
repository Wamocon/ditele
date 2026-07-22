import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { fromSupabase, ok, type Result } from "@/shared/data/result";
import {
  arenaHuntHref,
  huntPrerequisite,
  toLockReasons,
  type LockReason,
} from "@/features/arena/model";
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
  /**
   * Listed, but not yet playable. The hub shows these so a learner can see the
   * road ahead; only an unlocked one is a link, because the task route refuses
   * a locked task and the row would otherwise be a trapdoor.
   */
  locked: boolean;
  /** For a locked hunt: the task standing in front of it. */
  lockedAfterTitle: string;
}

const CourseListRow = z.object({ course_id: z.string() });

/**
 * The hunts this learner can play **right now**.
 *
 * ⚠️ It used to answer a subtly different question, and the difference was a
 * wall of dead links. It read every task's `required_task` lock reason and
 * listed the hunt named in it — "what is standing between me and this locked
 * task" — without ever asking whether that hunt was itself open. With one hunt
 * per course and no ordering between hunts, those two questions had the same
 * answer and the bug could not appear.
 *
 * The Praxiskurs import made them differ. 43 days chained through
 * `prerequisites` means at most one task in the whole course is available, so
 * the hub cheerfully listed **36 offene Jagden**, every one of them locked, and
 * each link led to `get_my_learning_task` — which returns NULL for a locked
 * task, by design — and rendered "Etwas ist schiefgelaufen · Nicht gefunden".
 * Every single row on the page was a trapdoor.
 *
 * So the list is now built from the hunt activities themselves, filtered to the
 * ones the learner can actually open. The "unlocks" subtitle is still the point
 * of playing it, so it is looked up afterwards from whichever task names this
 * hunt in its lock reasons.
 *
 * Nothing here reads `tasks` — a learner reads zero rows from that table
 * (`RPC_CONTRACTS.md` §10) — so every title still comes from the learner's own
 * published-content projection.
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

    const activities = activitiesOf(detail.data);

    // taskId → the title of a task that this hunt would unlock. Built once per
    // course rather than scanned per hunt.
    const unlocks = new Map<string, string>();
    for (const activity of activities) {
      const reason: LockReason | null = huntPrerequisite(activity.lock_reasons);
      if (reason?.requiredTaskId && !unlocks.has(reason.requiredTaskId)) {
        unlocks.set(reason.requiredTaskId, activity.title);
      }
    }

    for (const activity of activities) {
      if (activity.task_kind !== "hunt" || !activity.id) continue;
      // Already played and accepted — it is no longer something to do next.
      if (activity.state === "accepted" || activity.state === "completed") continue;
      if (seen.has(activity.id)) continue;

      seen.add(activity.id);
      hunts.push({
        taskId: activity.id,
        title: activity.title,
        unlocksTitle: unlocks.get(activity.id) ?? "",
        // Only an OPEN hunt gets a destination. `activity.locked` is the
        // learner projection's own verdict, so it cannot disagree with what the
        // route will decide when the link is followed — which is the whole
        // reason the dead links existed.
        href: activity.locked ? "" : arenaHuntHref(locale, activity.id),
        locked: activity.locked,
        lockedAfterTitle: activity.locked
          ? (huntPrerequisite(activity.lock_reasons)?.requiredTaskTitle ??
             requiredTaskTitleOf(activity.lock_reasons))
          : "",
      });
    }
  }

  // Playable first — the hub's job is "what should I play next", and a learner
  // should not have to scroll past thirty locked days to find it.
  return ok([
    ...hunts.filter((hunt) => !hunt.locked),
    ...hunts.filter((hunt) => hunt.locked),
  ]);
}

/**
 * The title of whatever task a lock names, hunt or not.
 *
 * `huntPrerequisite` only matches a `required_task` reason whose required task
 * is itself a HUNT. A hunt waiting on a knowledge task — which is most of them
 * in a day-by-day course — matches nothing, and the row would say "Gesperrt"
 * without saying by what.
 */
function requiredTaskTitleOf(reasons: unknown): string {
  return (
    toLockReasons(reasons).find(
      (reason) => reason.code === "required_task" && reason.requiredTaskTitle,
    )?.requiredTaskTitle ?? ""
  );
}

interface Activity {
  id: string;
  title: string;
  task_kind: string;
  state: string;
  locked: boolean;
  lock_reasons: unknown;
}

/** Walks `get_my_learning_course`'s stages → activities without trusting either. */
function activitiesOf(course: unknown): Activity[] {
  if (!course || typeof course !== "object") return [];
  const stages = (course as { stages?: unknown }).stages;
  if (!Array.isArray(stages)) return [];

  const text = (value: unknown): string => (typeof value === "string" ? value : "");

  const out: Activity[] = [];
  for (const stage of stages) {
    const activities = (stage as { activities?: unknown })?.activities;
    if (!Array.isArray(activities)) continue;
    for (const activity of activities) {
      if (!activity || typeof activity !== "object") continue;
      const row = activity as Record<string, unknown>;
      out.push({
        id: text(row.id),
        title: text(row.title),
        task_kind: text(row.task_kind),
        state: text(row.state),
        /**
         * ⚠️ Derived, because the RPC has no `locked` key — measured against
         * the live payload, which carries `lock_reasons` and nothing else on
         * the subject. `shared/data/learning.ts` derives it the same way
         * (`lock_reasons.length > 0`) and the two must not drift: this is the
         * condition that decides whether a link is offered at all.
         *
         * A missing or non-array `lock_reasons` counts as LOCKED. Listing a
         * hunt that turns out to be shut is the exact failure this function
         * exists to prevent, so the unknown case fails closed.
         */
        locked: !Array.isArray(row.lock_reasons) || row.lock_reasons.length > 0,
        lock_reasons: row.lock_reasons,
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
