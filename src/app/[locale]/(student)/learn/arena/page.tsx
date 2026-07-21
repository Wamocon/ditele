import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { formatNumber } from "@/shared/format";
import { getArenaMessages, format } from "@/features/arena/rewards/i18n";
import { LevelCard } from "@/features/arena/rewards/level-card";
import {
  BadgeSection,
  HuntSection,
  XpSection,
} from "@/features/arena/rewards/hub-sections";
import {
  countPendingHuntFindings,
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
 * The streak tile and the celebration overlay arrive with `20260725200000`;
 * until that migration is applied this page renders a real, complete standing
 * from `xp_ledger` and `badge_awards` and simply has no streak to show. That is
 * a smaller page, not a stub — every section reads live data and has an honest
 * empty state.
 */
export default async function ArenaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getArenaMessages(locale);
  const t = messages.arena.rewards;

  // Four independent reads. `Promise.all` rather than sequential awaits: none
  // depends on another, and the hunt list already costs one round trip per
  // enrolled course.
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
        <ErrorState title={t.loadErrorTitle} message={xp.error.message} locale={locale} />
      </>
    );
  }

  const { standing, recent } = xp.data;
  // A failed side read degrades its own section rather than the page. A learner
  // whose badge query failed should still see their level.
  const badgeList = badges.ok ? badges.data : [];
  const huntList = hunts.ok ? hunts.data : [];
  const pendingCount = pending.ok ? pending.data : 0;

  const levelName = t.levels[standing.key];

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <div className="flex flex-col gap-8">
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
            streakValue: t.streakNone,
            streakCaption: "",
            badgesHeading: t.badgesHeading,
            badgesValue: format(t.badgesCount, { count: badgeList.length }),
          }}
        />

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
