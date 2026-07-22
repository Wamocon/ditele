import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { formatNumber } from "@/shared/format";
import { getArenaMessages, format } from "@/features/arena/rewards/i18n";
import { LevelCard, streakGoal } from "@/features/arena/rewards/level-card";
import { CelebrationBanner } from "@/features/arena/rewards/celebration";
import { dismissCelebration } from "@/features/arena/rewards/actions";
import { STREAK_FREEZES_PER_MONTH } from "@/features/arena/rewards/model";
import {
  BadgeSection,
  HuntSection,
  XpSection,
} from "@/features/arena/rewards/hub-sections";
import {
  countPendingHuntFindings,
  getArenaSummary,
  getXpStanding,
  listMyBadges,
  listOpenHunts,
} from "@/features/arena/rewards/data";

/**
 * The Arena hub — `06_…` §8 item 6.
 *
 * ⚠️ **This route was urgent before it was useful.** WS-8 added the `Arena`
 * entry to `nav-config.ts` (it had to; §7 forbids any other Arena workstream
 * from touching that file), so from that commit until this one every student
 * page in the app fired a prefetch at `/…/learn/arena` and took a 404 — a
 * console error on every page load, not a dormant dead link. See ISSUES I-043.
 *
 * Every section reads live data and has an honest empty state — which matters
 * more here than on most screens, because a brand-new learner opening the Arena
 * for the first time sees nothing but empty states, and they are the product
 * rather than a fallback.
 */
export default async function ArenaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getArenaMessages(locale);
  const t = messages.arena.rewards;

  // ⚠️ `getArenaSummary` is awaited FIRST and on its own, not inside the
  // Promise.all below. It is the one read that also writes: the RPC refreshes
  // the streak and can award streak XP before it answers. Racing it against
  // `getXpStanding` would sometimes render a total that predates the award it
  // just made, so the learner would see their streak bonus only on the next
  // page load.
  const summary = await getArenaSummary();

  // The remaining four are independent reads, so they go together. The hunt
  // list alone already costs one round trip per enrolled course.
  const [xp, badges, hunts, pending] = await Promise.all([
    getXpStanding(),
    listMyBadges(locale),
    listOpenHunts(locale),
    countPendingHuntFindings(),
  ]);

  if (!xp.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <ErrorState title={t.loadErrorTitle} error={xp.error} locale={locale} />
      </>
    );
  }

  const { standing, recent } = xp.data;
  // A failed side read degrades its own section rather than the page. A learner
  // whose badge query failed should still see their level.
  const badgeList = badges.ok ? badges.data : [];
  const huntList = hunts.ok ? hunts.data : [];
  const pendingCount = pending.ok ? pending.data : 0;
  const streak = summary.ok ? summary.data.streak : null;
  const celebrations = summary.ok ? summary.data.celebrations : [];

  const levelName = t.levels[standing.key];

  // "3 Tage" vs "1 Tag" — German needs the singular, and a streak of exactly
  // one day is the most common non-zero value there is.
  const streakValue = !streak || streak.currentLength === 0
    ? t.streakNone
    : format(streak.currentLength === 1 ? t.streakDay : t.streakDays, {
        days: streak.currentLength,
      });

  const streakCaption = !streak
    ? ""
    : streak.activeToday
      ? t.streakActiveToday
      : t.streakIdleToday;

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <div className="flex flex-col gap-8">
        <CelebrationBanner
          celebrations={celebrations}
          onDismiss={dismissCelebration}
          strings={{
            badgeTitle: t.celebrationBadgeTitle,
            // A template, not a formatter — see CelebrationStrings.
            levelTitle: t.celebrationLevelTitle,
            dismiss: t.celebrationDismiss,
            regionLabel: t.celebrationRegion,
          }}
        />

        <LevelCard
          standing={standing}
          locale={locale}
          strings={{
            levelHeading: format(t.levelHeading, { level: standing.level }),
            levelCaption: levelName,
            xpTotal: format(t.xpTotal, { xp: formatNumber(standing.totalXp, locale, 0) }),
            xpToNext: format(t.xpToNext, {
              xp: formatNumber(standing.xpToNextLevel ?? 0, locale, 0),
              level: standing.level + 1,
            }),
            xpMaxLevel: t.xpMaxLevel,
            levelProgressLabel: format(t.levelProgressLabel, {
              percent: standing.progressPercent,
            }),
            streakHeading: t.streakHeading,
            streakValue,
            streakCaption,
            badgesHeading: t.badgesHeading,
            badgesValue: format(t.badgesCount, { count: badgeList.length }),
          }}
        />

        {streak && streak.currentLength > 0 ? (
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">
            {format(t.streakLongest, {
              days: format(
                streak.longestLength === 1 ? t.streakDay : t.streakDays,
                { days: streak.longestLength },
              ),
            })}
            {" · "}
            {format(t.streakFreezes, {
              count: streak.freezesRemaining,
              total: STREAK_FREEZES_PER_MONTH,
            })}
            {streakGoal(streak, (values) => format(t.streakNextMilestone, values))
              ? ` · ${streakGoal(streak, (values) => format(t.streakNextMilestone, values))}`
              : ""}
          </p>
        ) : null}

        <HuntSection
          hunts={huntList}
          pendingCount={pendingCount}
          coursesHref={`/${locale}/learn/courses`}
          strings={{
            heading: t.huntsHeading,
            open: format(t.huntsOpen, { count: huntList.length }),
            pending: format(t.huntsPending, { count: pendingCount }),
            pendingHint: t.huntsPendingHint,
            emptyTitle: t.huntsEmptyTitle,
            emptyDescription: t.huntsEmptyDescription,
            emptyAction: t.huntsOpenAction,
            unlocksLabel: t.huntsUnlocks,
          }}
        />

        <BadgeSection
          badges={badgeList}
          locale={locale}
          strings={{
            heading: t.badgesHeading,
            emptyTitle: t.badgesEmptyTitle,
            emptyDescription: t.badgesEmptyDescription,
            awardedAt: (date) => format(t.badgeAwardedAt, { date }),
          }}
        />

        <XpSection
          entries={recent}
          locale={locale}
          strings={{
            heading: t.xpHeading,
            emptyTitle: t.xpEmptyTitle,
            emptyDescription: t.xpEmptyDescription,
            points: (points) => format(t.xpEntryPoints, { points }),
            ruleLabel: (code) =>
              (t.rules as Record<string, string | undefined>)[code] ?? null,
          }}
        />
      </div>
    </>
  );
}
