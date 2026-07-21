import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Badge, ErrorState, cn } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listProgressBoard, RISK_SIGNALS, type RiskSignal } from "@/shared/data/progress";
import { getAdminDict, fill } from "@/features/admin/i18n";
import { ProgressLegend, ProgressTable } from "@/features/admin/progress-table";

/**
 * WS-12 — `/[locale]/admin/progress`. `05_…` §G10, `06_…` §8 WS-12 items 1–2.
 *
 * One row per active enrollment, **sorted by risk**. The sort arrives from the
 * database already applied; see `progress-table.tsx` for why it is not redone
 * here.
 *
 * The filter is plain links rather than a form. Three reasons, in order of how
 * much they matter: it works with JavaScript disabled, each chip is a real
 * anchor a screen reader announces as a link to a filtered view, and it keeps
 * the page a Server Component with no client bundle at all.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getAdminDict(locale);
  return { title: dict.progress.title };
}

function isRiskSignal(value: string): value is RiskSignal {
  return (RISK_SIGNALS as readonly string[]).includes(value);
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const dict = await getAdminDict(locale);
  const p = dict.progress;

  const query = await searchParams;
  const rawRisk = Array.isArray(query.risk) ? query.risk[0] : query.risk;
  const risk = rawRisk && isRiskSignal(rawRisk) ? rawRisk : undefined;

  const board = await listProgressBoard(locale);

  if (!board.ok) {
    return (
      <>
        <PageHeader title={p.title} description={p.description} />
        <ErrorState message={board.error.message} />
      </>
    );
  }

  const all = board.data;
  const rows = risk ? all.filter((row) => row.risks.includes(risk)) : all;
  const atRisk = all.filter((row) => row.risks.length > 0).length;

  const filterHref = (value?: RiskSignal): Route =>
    (value
      ? `/${locale}/admin/progress?risk=${value}`
      : `/${locale}/admin/progress`) as Route;

  const chip = (label: string, href: Route, active: boolean, count: number) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        // 44px minimum touch target — WS-7 fixed these once; they stay fixed.
        "inline-flex h-11 min-h-11 items-center gap-2 rounded-(--radius-sm) border px-3",
        "text-[13px] font-semibold leading-4 transition-colors duration-(--duration-base)",
        active
          ? "border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)"
          : "border-(--color-border) text-(--color-fg-muted) hover:bg-(--color-surface)"
      )}
    >
      <span>{label}</span>
      <span className="tabular text-(--color-fg-muted)">{count}</span>
    </Link>
  );

  return (
    <>
      <PageHeader title={p.title} description={p.description} />

      {/* The headline number an admin actually opens this page for. */}
      <p className="mb-4 text-[15px] leading-6">
        {atRisk > 0 ? (
          <Badge tone="warning" dot>
            {fill(p.summaryAtRisk, { count: atRisk, total: all.length })}
          </Badge>
        ) : (
          <span className="text-(--color-fg-muted)">
            {fill(p.summaryAllClear, { total: all.length })}
          </span>
        )}
      </p>

      {all.length > 0 && (
        <nav aria-label={p.filterRisk} className="mb-4 flex flex-wrap gap-2">
          {chip(p.filterAllRisks, filterHref(), !risk, all.length)}
          {RISK_SIGNALS.map((signal) =>
            chip(
              signal === "stalled" ? p.riskStalled : signal === "behind" ? p.riskBehind : p.riskStuck,
              filterHref(signal),
              risk === signal,
              all.filter((row) => row.risks.includes(signal)).length
            )
          )}
        </nav>
      )}

      <ProgressTable rows={rows} dict={dict} now={new Date()} filtered={Boolean(risk)} />

      <ProgressLegend dict={dict} />
    </>
  );
}
