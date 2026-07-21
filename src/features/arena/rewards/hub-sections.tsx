import type { Route } from "next";
import Link from "next/link";
import { Award, Bug, Sparkles } from "lucide-react";
import { Badge, Card, EmptyState } from "@/shared/ui";
import { formatDate } from "@/shared/format";
import type { BadgeAward, XpEntry } from "./model";
import type { OpenHunt } from "./data";

/**
 * The three lists under the standing card: badges, hunts, recent XP.
 *
 * All three are presentational and string-fed. All three have a real empty
 * state, because on a fresh account all three *are* empty — and this is the one
 * screen in the app a brand-new learner is most likely to open first, so its
 * empty states are the product, not a fallback.
 */

/* ── Badges ───────────────────────────────────────────────────────────────── */

export interface BadgeSectionStrings {
  heading: string;
  emptyTitle: string;
  emptyDescription: string;
  awardedAt: (date: string) => string;
}

export function BadgeSection({
  badges,
  strings,
  locale,
}: {
  badges: BadgeAward[];
  strings: BadgeSectionStrings;
  locale: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold leading-6">{strings.heading}</h2>
      {badges.length === 0 ? (
        <EmptyState
          title={strings.emptyTitle}
          description={strings.emptyDescription}
          icon={<Award className="size-6 text-(--color-fg-subtle)" aria-hidden />}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((badge) => (
            <li key={`${badge.code}-${badge.awardedAt}`}>
              <Card className="flex h-full flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Award className="mt-0.5 size-5 shrink-0 text-(--color-brand)" aria-hidden />
                  <p className="text-[15px] font-semibold leading-6">{badge.label}</p>
                </div>
                {badge.description ? (
                  <p className="text-[13px] leading-5 text-(--color-fg-muted)">
                    {badge.description}
                  </p>
                ) : null}
                <p className="mt-auto pt-2 text-[12px] leading-4 text-(--color-fg-subtle)">
                  {strings.awardedAt(formatDate(badge.awardedAt, locale))}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Hunts ────────────────────────────────────────────────────────────────── */

export interface HuntSectionStrings {
  heading: string;
  open: string;
  pending: string;
  pendingHint: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction: string;
  unlocksLabel: string;
}

/**
 * `05_…` §G8 from the learner's side: not "why is this locked" but "what should
 * I play next, and what does it open".
 *
 * The pending count sits beside it with an explicit hint that a filed report is
 * worth nothing until a trainer accepts it. That sentence is the guard rail in
 * §G5 made visible — a learner who can see that submitting alone pays nothing
 * has no reason to spam low-effort reports.
 */
export function HuntSection({
  hunts,
  pendingCount,
  strings,
  coursesHref,
}: {
  hunts: OpenHunt[];
  pendingCount: number;
  strings: HuntSectionStrings;
  coursesHref: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-semibold leading-6">{strings.heading}</h2>
        {hunts.length > 0 ? <Badge tone="brand">{strings.open}</Badge> : null}
        {pendingCount > 0 ? <Badge tone="warning">{strings.pending}</Badge> : null}
      </div>

      {pendingCount > 0 ? (
        <p className="max-w-[68ch] text-[13px] leading-5 text-(--color-fg-muted)">
          {strings.pendingHint}
        </p>
      ) : null}

      {hunts.length === 0 ? (
        <EmptyState
          title={strings.emptyTitle}
          description={strings.emptyDescription}
          icon={<Bug className="size-6 text-(--color-fg-subtle)" aria-hidden />}
          action={
            <Link
              href={coursesHref as Route}
              className="inline-flex min-h-11 items-center rounded-(--radius-md) border border-(--color-border) px-4 text-[14px] font-semibold leading-5 transition-colors hover:bg-(--color-surface-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
            >
              {strings.emptyAction}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {hunts.map((hunt) => (
            <li key={hunt.taskId}>
              {/* min-h-11 is the 44px touch target WS-7 fixed once already. */}
              <Link
                href={hunt.href as Route}
                className="flex min-h-11 flex-col gap-1 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 transition-colors hover:bg-(--color-surface-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
              >
                <span className="flex items-center gap-2 text-[15px] font-semibold leading-6">
                  <Bug className="size-4 shrink-0 text-(--color-brand)" aria-hidden />
                  {hunt.title}
                </span>
                {hunt.unlocksTitle ? (
                  <span className="text-[13px] leading-5 text-(--color-fg-muted)">
                    {strings.unlocksLabel} {hunt.unlocksTitle}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Recent XP ────────────────────────────────────────────────────────────── */

export interface XpSectionStrings {
  heading: string;
  emptyTitle: string;
  emptyDescription: string;
  points: (points: number) => string;
  /** Translated rule name, or `null` to fall back to the stored rationale. */
  ruleLabel: (code: string) => string | null;
}

export function XpSection({
  entries,
  strings,
  locale,
}: {
  entries: XpEntry[];
  strings: XpSectionStrings;
  locale: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold leading-6">{strings.heading}</h2>
      {entries.length === 0 ? (
        <EmptyState
          title={strings.emptyTitle}
          description={strings.emptyDescription}
          icon={<Sparkles className="size-6 text-(--color-fg-subtle)" aria-hidden />}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-(--color-border) rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-semibold leading-5">
                  {strings.ruleLabel(entry.ruleCode) ?? entry.rationale}
                </span>
                <span className="text-[12px] leading-4 text-(--color-fg-subtle)">
                  {formatDate(entry.awardedAt, locale)}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-semibold leading-5 text-(--color-brand)">
                {strings.points(entry.points)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
