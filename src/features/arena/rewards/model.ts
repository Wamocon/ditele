/**
 * The reward model — XP rules, levels and streaks as **pure data and pure
 * functions**, with no server imports.
 *
 * Same split, and the same reason, as `src/features/arena/model.ts`: the
 * celebration and the level meter are Client Components that need this at
 * runtime. `./data.ts` is `server-only`; importing it from the browser drags
 * `next/headers` into the client bundle and the route 500s.
 *
 * ⚠️ **These numbers are the contract with the database, not a copy of it.**
 * The same table is seeded into `public.xp_rules` by migration
 * `20260725100000`, and `scripts/ws11-check-rules.mjs` asserts the two agree.
 * If you change a value here you must ship a migration that changes it there
 * *and* bumps `rule_version` — otherwise the ledger's `rule_version` stops
 * describing the points it recorded, which is the one thing `rule_version`
 * exists to prevent.
 */

/* ── XP, §8.1 of anforderung/01_RESEARCH_LERNPLATTFORM.md ─────────────────── */

/**
 * The reward table, verbatim from §8.1. `code` is the stable identifier the
 * ledger records; the German label of each row lives in `de.json` under
 * `arena.rewards.rules.*` so it can be translated.
 *
 * `awarded` says whether anything in the shipped app actually pays this rule
 * today. Several §8.1 rows describe events this application does not yet emit
 * — there is no video-completion signal, no quiz scoring path and no content
 * feedback capture. They are seeded anyway, at their specified value, so that
 * wiring one later is a call site rather than a migration. Listing them as
 * `false` is deliberate: an unpaid rule that looks paid is a promise to the
 * learner the app cannot keep.
 */
export const XP_RULES = [
  { code: "video_completed", points: 10, awarded: false },
  { code: "pdf_read", points: 5, awarded: false },
  { code: "quiz_passed", points: 25, awarded: false },
  { code: "quiz_perfect", points: 40, awarded: false },
  { code: "practice_submitted", points: 15, awarded: false },
  { code: "practice_approved", points: 50, awarded: true },
  { code: "defect_report", points: 20, awarded: true },
  { code: "milestone_reached", points: 100, awarded: false },
  { code: "module_completed", points: 150, awarded: false },
  { code: "course_completed", points: 500, awarded: false },
  { code: "daily_activity", points: 5, awarded: true },
  { code: "question_answered_helpful", points: 10, awarded: false },
  { code: "bug_report_submitted", points: 15, awarded: false },
  { code: "content_feedback", points: 5, awarded: false },

  /**
   * Not in §8.1 — **derived** from it, and marked so a future re-scoring can
   * see it was derived rather than specified.
   *
   * A learner who reports a real defect we did not plant has done two things at
   * once: filed a defect report (20) *and* told us about a genuine bug in our
   * own build (15). `05_…` §G2 is explicit that this must be worth **more**,
   * not less, than finding a planted one.
   */
  { code: "defect_report_bonus", points: 35, awarded: true },

  /* §8.4 verbatim — the streak milestone bonuses. 3 days is a badge only. */
  { code: "streak_7", points: 50, awarded: true },
  { code: "streak_14", points: 100, awarded: true },
  { code: "streak_30", points: 200, awarded: true },
  { code: "streak_100", points: 500, awarded: true },
] as const;

export type XpRuleCode = (typeof XP_RULES)[number]["code"];

/** The current rule set. Bump it in lockstep with the migration that reseeds. */
export const XP_RULE_VERSION = 1;

const POINTS_BY_CODE = new Map<string, number>(XP_RULES.map((r) => [r.code, r.points]));

/** Points for a rule code, or `null` if the code is not one we know. */
export function xpForRule(code: string): number | null {
  return POINTS_BY_CODE.get(code) ?? null;
}

/* ── Levels, §8.2 ─────────────────────────────────────────────────────────── */

/**
 * Twelve levels, §8.2 verbatim. `minXp` is inclusive; a level runs until the
 * next one's `minXp`. Level 12 has no ceiling.
 *
 * `key` indexes `de.json` at `arena.rewards.levels.<key>` — the German names
 * ("Neuling" … "Legende") are interface strings, so they are translatable, even
 * though nobody has translated them yet and they fall back to German by design.
 */
export const LEVELS = [
  { level: 1, key: "neuling", minXp: 0 },
  { level: 2, key: "entdecker", minXp: 100 },
  { level: 3, key: "lehrling", minXp: 300 },
  { level: 4, key: "testerAnwaerter", minXp: 600 },
  { level: 5, key: "juniorTester", minXp: 1000 },
  { level: 6, key: "tester", minXp: 1500 },
  { level: 7, key: "seniorTester", minXp: 2200 },
  { level: 8, key: "testExperte", minXp: 3000 },
  { level: 9, key: "testMeister", minXp: 4000 },
  { level: 10, key: "testChampion", minXp: 5500 },
  { level: 11, key: "testGuru", minXp: 7500 },
  { level: 12, key: "legende", minXp: 10000 },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

export interface LevelStanding {
  level: number;
  key: LevelKey;
  /** Total XP the learner holds. */
  totalXp: number;
  /** XP at which the current level started. */
  levelFloorXp: number;
  /** XP at which the next level starts, or `null` at the top level. */
  nextLevelXp: number | null;
  /** XP still needed for the next level, or `null` at the top level. */
  xpToNextLevel: number | null;
  /** 0–100, how far through the current level. 100 at the top level. */
  progressPercent: number;
}

/**
 * Where a learner stands, from a total.
 *
 * Negative or non-finite input resolves to level 1 rather than throwing: this
 * runs inside a page render, and a bad number should degrade the meter, not
 * take the Arena down.
 */
export function levelForXp(totalXp: number): LevelStanding {
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;

  // Widened deliberately: `LEVELS[0]` infers the level-1 literal, and the loop
  // below must be able to move past it.
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const candidate of LEVELS) {
    if (xp >= candidate.minXp) current = candidate;
    else break;
  }

  const next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  const xpToNextLevel = next ? next.minXp - xp : null;
  const span = next ? next.minXp - current.minXp : 0;

  return {
    level: current.level,
    key: current.key,
    totalXp: xp,
    levelFloorXp: current.minXp,
    nextLevelXp: next ? next.minXp : null,
    xpToNextLevel,
    progressPercent: span > 0 ? Math.min(100, Math.round(((xp - current.minXp) / span) * 100)) : 100,
  };
}

/* ── Streaks, §8.4 ────────────────────────────────────────────────────────── */

/**
 * The milestones, §8.4 verbatim. 3 days is a badge with no XP; the rest pay the
 * bonus named in `XP_RULES`.
 */
export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const;

/** §8.4: "Grace Period: 1 verpasster Tag → Streak Freeze (max. 2 pro Monat)". */
export const STREAK_FREEZES_PER_MONTH = 2;

export interface Streak {
  currentLength: number;
  longestLength: number;
  /** ISO date (`YYYY-MM-DD`) of the last day with real learning activity. */
  lastActivityDate: string | null;
  freezesRemaining: number;
  /** True when today has already been counted. Drives "heute erledigt". */
  activeToday: boolean;
}

/**
 * The next milestone a learner is working towards, or `null` once past 100.
 * This is the "→ Streak bis 14 → Badge Zwei Wochen Power" line in §8.6.
 */
export function nextStreakMilestone(currentLength: number): number | null {
  return STREAK_MILESTONES.find((m) => m > currentLength) ?? null;
}

/* ── Awards ───────────────────────────────────────────────────────────────── */

export interface XpEntry {
  id: string;
  points: number;
  ruleCode: string;
  sourceKind: string;
  rationale: string;
  awardedAt: string;
}

export interface BadgeAward {
  code: string;
  /** German label from `badges.labels`. Course-adjacent, but a badge name is
   *  interface chrome, so the row carries all three locales like `skills`. */
  label: string;
  description: string;
  awardedAt: string;
}

/**
 * What the Arena hub renders. One object, one RPC — `get_my_arena_summary`.
 *
 * `celebrations` are unread `badge.awarded` / `level.up` notifications. Reusing
 * the notification's read state as the "has this been celebrated" flag is
 * deliberate: it needs no new column, it already dedupes (`notifications` is
 * UNIQUE on `recipient_id, deduplication_key`), and dismissing a celebration is
 * the shipped `mark_notification_read` RPC rather than a new write path.
 */
export interface Celebration {
  notificationId: string;
  rowVersion: number;
  kind: "badge" | "level";
  /** Badge code, or the level number as a string. */
  reference: string;
  label: string;
}

export interface ArenaSummary {
  standing: LevelStanding;
  streak: Streak;
  badges: BadgeAward[];
  recentXp: XpEntry[];
  celebrations: Celebration[];
  /** Hunts submitted and still waiting on a trainer — "2 offene Jagden". */
  pendingHuntCount: number;
  /** Hunt tasks the learner may play right now. */
  openHuntCount: number;
}
