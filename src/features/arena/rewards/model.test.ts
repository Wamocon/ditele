import { describe, expect, it } from "vitest";
import {
  LEVELS,
  STREAK_FREEZES_PER_MONTH,
  STREAK_MILESTONES,
  XP_RULES,
  levelForXp,
  nextStreakMilestone,
  xpForRule,
} from "./model";

/**
 * The level boundaries are the one place where an off-by-one is invisible in
 * review and obvious to a learner — "1.000 XP and still Level 4" is the kind of
 * bug that makes the whole reward system feel broken. So every boundary in §8.2
 * is asserted on both sides.
 */
describe("levelForXp", () => {
  it("puts 0 XP at level 1", () => {
    const standing = levelForXp(0);
    expect(standing.level).toBe(1);
    expect(standing.key).toBe("neuling");
    expect(standing.xpToNextLevel).toBe(100);
    expect(standing.progressPercent).toBe(0);
  });

  it.each(LEVELS.filter((l) => l.level > 1))(
    "level $level starts exactly at $minXp XP",
    ({ level, minXp }) => {
      expect(levelForXp(minXp).level).toBe(level);
      expect(levelForXp(minXp - 1).level).toBe(level - 1);
    },
  );

  it("reports the distance to the next level", () => {
    const standing = levelForXp(1247);
    expect(standing.level).toBe(5); // "Junior Tester", 1.000–1.499
    expect(standing.nextLevelXp).toBe(1500);
    expect(standing.xpToNextLevel).toBe(253); // the §8.6 mock-up's own number
  });

  it("caps at level 12 with no next level", () => {
    const standing = levelForXp(25_000);
    expect(standing.level).toBe(12);
    expect(standing.key).toBe("legende");
    expect(standing.nextLevelXp).toBeNull();
    expect(standing.xpToNextLevel).toBeNull();
    expect(standing.progressPercent).toBe(100);
  });

  it("degrades rather than throws on nonsense input", () => {
    // This runs inside a page render. A bad total must not take the Arena down.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      expect(levelForXp(bad).level).toBe(1);
      expect(levelForXp(bad).totalXp).toBe(0);
    }
  });

  it("never reports progress outside 0–100", () => {
    for (let xp = 0; xp <= 11_000; xp += 37) {
      const percent = levelForXp(xp).progressPercent;
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});

describe("XP_RULES", () => {
  it("holds every §8.1 value verbatim", () => {
    // Spelled out rather than looped, so a silent edit to the table fails here.
    expect(xpForRule("video_completed")).toBe(10);
    expect(xpForRule("pdf_read")).toBe(5);
    expect(xpForRule("quiz_passed")).toBe(25);
    expect(xpForRule("quiz_perfect")).toBe(40);
    expect(xpForRule("practice_submitted")).toBe(15);
    expect(xpForRule("practice_approved")).toBe(50);
    expect(xpForRule("defect_report")).toBe(20);
    expect(xpForRule("milestone_reached")).toBe(100);
    expect(xpForRule("module_completed")).toBe(150);
    expect(xpForRule("course_completed")).toBe(500);
    expect(xpForRule("daily_activity")).toBe(5);
    expect(xpForRule("question_answered_helpful")).toBe(10);
    expect(xpForRule("bug_report_submitted")).toBe(15);
    expect(xpForRule("content_feedback")).toBe(5);
  });

  it("holds the §8.4 streak bonuses verbatim", () => {
    expect(xpForRule("streak_7")).toBe(50);
    expect(xpForRule("streak_14")).toBe(100);
    expect(xpForRule("streak_30")).toBe(200);
    expect(xpForRule("streak_100")).toBe(500);
  });

  it("pays more for an unplanted find than a planted one", () => {
    // 05_… §G2: "a student who finds a bug we did not plant should be rewarded
    // more, not marked wrong". If this ever inverts, the game teaches the
    // opposite of the course.
    expect(xpForRule("defect_report_bonus")!).toBeGreaterThan(xpForRule("defect_report")!);
  });

  it("has unique codes and only positive point values", () => {
    // xp_ledger.points carries `check (points > 0)`, so a zero or negative rule
    // would fail at insert time — in production, on a trainer's accept click.
    const codes = XP_RULES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const rule of XP_RULES) expect(rule.points).toBeGreaterThan(0);
  });

  it("returns null for a code it does not know", () => {
    expect(xpForRule("no-such-rule")).toBeNull();
  });
});

describe("streaks", () => {
  it("follows the §8.4 milestones", () => {
    expect([...STREAK_MILESTONES]).toEqual([3, 7, 14, 30, 100]);
    expect(STREAK_FREEZES_PER_MONTH).toBe(2);
  });

  it("names the next milestone, and stops after the last", () => {
    expect(nextStreakMilestone(0)).toBe(3);
    expect(nextStreakMilestone(3)).toBe(7);
    expect(nextStreakMilestone(12)).toBe(14);
    expect(nextStreakMilestone(100)).toBeNull();
    expect(nextStreakMilestone(365)).toBeNull();
  });

  it("pays a bonus for every milestone except the first", () => {
    // §8.4 gives 3 days a badge and no XP; every later milestone pays.
    for (const milestone of STREAK_MILESTONES.filter((m) => m > 3)) {
      expect(xpForRule(`streak_${milestone}`)).toBeGreaterThan(0);
    }
    expect(xpForRule("streak_3")).toBeNull();
  });
});
