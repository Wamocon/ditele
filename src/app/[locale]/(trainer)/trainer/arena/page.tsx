import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Badge, Card, EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listHuntScenarioDefects, listHuntScenarios } from "@/shared/data/arena";
import { getTranslator } from "@/features/review/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.arena.title") };
}

/**
 * The trainer's Arena overview — Phase 4.
 *
 * Until now a trainer met the Arena only inside one submission, through the
 * *Fehlerjagd — Abgleich* panel, which shows the planted list for that one
 * scenario at the moment they are already judging a report. There was nowhere
 * to read the ground truth BEFORE the queue, and QA_TEST_PLAN §9 recorded the
 * absence as deliberate-for-now.
 *
 * This is that page: every hunt, and what was planted in it.
 *
 * ⚠️ It shows the ANSWER KEY, and that is the point — a trainer cannot judge
 * "hat diese Person den Rabatt-Fehler gefunden?" without knowing what the
 * defect was. It is safe because `hunt_scenario_defects` carries exactly one
 * RLS policy and it requires `content.manage` or `review.manage`; a learner
 * reading this table gets zero rows, and there is no learner route to this
 * page anyway. The banner says so out loud so nobody demonstrates the screen on
 * a projector with a cohort in the room.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer"], locale);

  const t = await getTranslator(locale);
  const scenarios = await listHuntScenarios();

  const header = (
    <PageHeader title={t("trainer.arena.title")} description={t("trainer.arena.subtitle")} />
  );

  if (!scenarios.ok) {
    return (
      <>
        {header}
        <ErrorState message={scenarios.error.message} />
      </>
    );
  }

  // Only the hunts a learner can actually meet. A draft or retired scenario in
  // this list would have a trainer preparing for a review that cannot arrive.
  const active = scenarios.data.filter((scenario) => scenario.state === "active");

  if (active.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title={t("trainer.arena.empty")}
          description={t("trainer.arena.emptyDescription")}
        />
      </>
    );
  }

  const defectsById = new Map(
    await Promise.all(
      active.map(async (scenario) => {
        const result = await listHuntScenarioDefects(scenario.id);
        return [scenario.id, result.ok ? result.data : []] as const;
      })
    )
  );

  return (
    <>
      {header}

      <div className="mb-4 flex items-start gap-3 rounded-(--radius-md) border border-(--color-warning) bg-(--color-warning-soft) px-4 py-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-(--color-warning)" aria-hidden />
        <p className="text-[13px] leading-5">{t("trainer.arena.answerKeyWarning")}</p>
      </div>

      <ul className="flex list-none flex-col gap-4 p-0">
        {active.map((scenario) => {
          const defects = defectsById.get(scenario.id) ?? [];
          return (
            <li key={scenario.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/* Course material — German, straight from the row. */}
                    <h2 className="text-[17px] font-semibold leading-6">{scenario.title}</h2>
                    <p className="text-[13px] text-(--color-fg-muted)">
                      {scenario.code} · v{scenario.scenarioVersion}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">
                      {t("trainer.arena.expected")}: {scenario.expectedFindings}
                    </Badge>
                    <StatusBadge state={scenario.state} locale={locale} />
                  </div>
                </div>

                {scenario.description !== "" && (
                  <p className="max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">
                    {scenario.description}
                  </p>
                )}

                <h3 className="text-[13px] font-semibold">{t("trainer.arena.defects")}</h3>
                {defects.length === 0 ? (
                  <p className="text-[13px] text-(--color-fg-muted)">
                    {t("trainer.arena.noDefects")}
                  </p>
                ) : (
                  <ul className="flex list-none flex-col gap-3 p-0">
                    {defects.map((defect) => (
                      <li
                        key={defect.id}
                        className="flex flex-col gap-1 border-t border-(--color-border) pt-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded-(--radius-sm) bg-(--color-surface-2) px-1.5 py-0.5 text-[12px]">
                            {defect.code}
                          </code>
                          <span className="text-[14px] font-medium">{defect.title}</span>
                          <Badge tone="neutral">{defect.severity}</Badge>
                        </div>
                        {defect.locationHint !== "" && (
                          <p className="text-[13px] text-(--color-fg-muted)">
                            {t("trainer.arena.where")}: {defect.locationHint}
                          </p>
                        )}
                        {defect.expectedBehaviour !== "" && (
                          <p className="text-[13px] text-(--color-fg-muted)">
                            {t("trainer.arena.expectedBehaviour")}: {defect.expectedBehaviour}
                          </p>
                        )}
                        {defect.reproduction !== "" && (
                          <p className="text-[13px] text-(--color-fg-muted)">
                            {t("trainer.arena.reproduction")}: {defect.reproduction}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
