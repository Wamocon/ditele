import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { Badge, ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listProgressBoard } from "@/shared/data/progress";
import { getTranslator } from "@/features/review/i18n";
import { getAdminDict, fill } from "@/features/admin/i18n";
import { ProgressLegend, ProgressTable } from "@/features/admin/progress-table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.progress.title") };
}

/**
 * ⭐ Unified with `/admin/progress` by WS-13 — `06_…` §8 WS-12 item 4, carried
 * here as `ISSUES.md` I-055.
 *
 * This screen used to compute from `cohort_memberships`, because a trainer
 * session read 0 rows from `enrollments` (I-018) at the time it was written.
 * The course-trainer migration fixed that policy and WS-12 replaced both reads
 * with one `security definer` RPC that scopes itself by the caller: an admin
 * sees their organization, a trainer sees the courses they hold in
 * `course_trainers`. Measured — a trainer reads 6 rows where the admin reads 7.
 *
 * The point is not tidiness. Two screens that are *supposed* to agree
 * eventually do not, and on a progress board a disagreement is invisible: both
 * numbers look like data. One function that scopes by the caller cannot
 * disagree with itself.
 *
 * Two deliberate differences from the admin board:
 *
 *   * **No flag-to-trainer control.** `flag_learner_to_trainer` notifies the
 *     course's trainers, and this reader *is* one — the RPC refuses a trainer
 *     caller, and WS-12's probe §4 asserts that refusal. A button that always
 *     fails is worse than no button.
 *   * **No risk filter chips.** A trainer holds a handful of learners, so the
 *     risk sort is enough; the chips exist for an admin triaging a whole
 *     organization.
 *
 * The old cohort filter is gone with the old data source: the board's dimension
 * is the course, not the cohort, and scoping already limits a trainer to their
 * own courses.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  // The board's own strings live in the admin dictionary because the table
  // component does. Same German either way — the alternative was a second copy
  // of 50 column labels that would drift from the ones the admin reads.
  const dict = await getAdminDict(locale);
  const board = await listProgressBoard(locale);

  if (!board.ok) {
    return (
      <>
        <PageHeader
          title={t("trainer.progress.title")}
          description={t("trainer.progress.description")}
        />
        <ErrorState message={board.error.message} />
      </>
    );
  }

  const rows = board.data;
  const atRisk = rows.filter((row) => row.risks.length > 0).length;

  return (
    <>
      <PageHeader
        title={t("trainer.progress.title")}
        description={t("trainer.progress.description")}
      />

      <p className="mb-4 text-[15px] leading-6">
        {atRisk > 0 ? (
          <Badge tone="warning" dot>
            {fill(dict.progress.summaryAtRisk, { count: atRisk, total: rows.length })}
          </Badge>
        ) : (
          <span className="text-(--color-fg-muted)">
            {fill(dict.progress.summaryAllClear, { total: rows.length })}
          </span>
        )}
      </p>

      <ProgressTable rows={rows} dict={dict} now={new Date()} />

      <ProgressLegend dict={dict} />
    </>
  );
}
