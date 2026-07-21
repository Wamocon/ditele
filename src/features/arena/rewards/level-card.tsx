import { Card } from "@/shared/ui";
import { formatNumber } from "@/shared/format";
import type { LevelStanding, Streak } from "./model";
import { nextStreakMilestone, STREAK_FREEZES_PER_MONTH } from "./model";

/**
 * The four tiles §8.6 draws — level, streak, XP-to-next, badge count — plus the
 * level meter under them.
 *
 * Presentational and string-fed on purpose: every label arrives resolved, so
 * the same component serves the hub today and can serve the profile or an
 * admin row later without either of them reaching into `de.json`.
 *
 * Colours are tokens only. The meter uses `--color-brand` on
 * `--color-surface-2`, which `check-contrast.mjs` already covers in both
 * themes; nothing here introduces a new pair.
 */

export interface LevelCardStrings {
  levelHeading: string;
  levelCaption: string;
  xpTotal: string;
  xpToNext: string;
  xpMaxLevel: string;
  levelProgressLabel: string;
  streakHeading: string;
  streakValue: string;
  streakCaption: string;
  badgesHeading: string;
  badgesValue: string;
}

export function LevelCard({
  standing,
  strings,
  locale,
}: {
  standing: LevelStanding;
  strings: LevelCardStrings;
  locale: string;
}) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Tile heading={strings.levelHeading} value={strings.levelCaption} />
        <Tile heading={strings.streakHeading} value={strings.streakValue} caption={strings.streakCaption} />
        <Tile
          heading={strings.xpTotal}
          value={standing.xpToNextLevel === null ? strings.xpMaxLevel : strings.xpToNext}
        />
        <Tile heading={strings.badgesHeading} value={strings.badgesValue} />
      </div>

      {/* `role="img"` with a label, not a progressbar: this reports a static
          standing, not a running operation, and a screen reader announcing
          "busy" would be wrong. */}
      <div
        className="h-2 w-full overflow-hidden rounded-(--radius-sm) bg-(--color-surface-2)"
        role="img"
        aria-label={strings.levelProgressLabel}
      >
        <div
          className="h-full rounded-(--radius-sm) bg-(--color-brand)"
          style={{ width: `${standing.progressPercent}%` }}
        />
      </div>

      <p className="text-[13px] leading-5 text-(--color-fg-muted)">
        {formatNumber(standing.totalXp, locale, 0)} XP
        {standing.nextLevelXp !== null
          ? ` / ${formatNumber(standing.nextLevelXp, locale, 0)} XP`
          : ""}
      </p>
    </Card>
  );
}

function Tile({
  heading,
  value,
  caption,
}: {
  heading: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex min-h-[92px] flex-col justify-center gap-1 rounded-(--radius-md) bg-(--color-surface-2) px-4 py-3">
      <p className="text-[12px] font-semibold uppercase leading-4 tracking-wide text-(--color-fg-muted)">
        {heading}
      </p>
      <p className="text-[17px] font-semibold leading-6">{value}</p>
      {caption ? (
        <p className="text-[12px] leading-4 text-(--color-fg-muted)">{caption}</p>
      ) : null}
    </div>
  );
}

/**
 * The §8.6 "Nächste Ziele" line for streaks, or `null` once past 100 days —
 * at which point there is no next milestone and inventing one would be a lie.
 */
export function streakGoal(
  streak: Streak,
  render: (values: Record<string, string | number>) => string,
): string | null {
  const milestone = nextStreakMilestone(streak.currentLength);
  if (milestone === null) return null;
  return render({ days: milestone - streak.currentLength, milestone });
}

export { STREAK_FREEZES_PER_MONTH };
