import type { Route } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Badge, Button, Card, EmptyState, ErrorState, StatusBadge, statusLabel } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import {
  countDefectsByScenario,
  listHuntScenarioDefects,
  listHuntScenarios,
} from "@/shared/data/arena";
import { adminStrings } from "@/features/content/i18n";
import { ScenarioEditor, type ScenarioEditorLabels } from "@/features/arena/authoring/scenario-editor";
import type { RecordState } from "@/features/content/model";

const SCENARIO_STATES: RecordState[] = ["draft", "active", "inactive", "archived"];

/**
 * Admin authoring for the Bug Arena — FEATURE_BUILD_PLAN §1.7.
 *
 * Until now hunt scenarios were seeded through SQL and there was no screen to
 * create, edit or retire one (QA plan §9). The schema, the commands and the
 * sandboxed renderer all landed in Phase 1c and 3; this is the caller they were
 * missing.
 *
 * Defects for every scenario are fetched up front so each row's modal opens
 * already populated. That is N+1 reads on paper, but the whole point of the
 * editor is that clicking "Bearbeiten" shows the answer key immediately —
 * fetching it on open would mean a spinner inside a modal for a list that is
 * typically five rows long.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const strings = adminStrings(locale);
  const s = strings.arena;

  const scenarios = await listHuntScenarios();

  const editorLabels: ScenarioEditorLabels = {
    new: s.new,
    edit: s.edit,
    formCode: s.formCode,
    formCodeHint: s.formCodeHint,
    formTitle: s.formTitle,
    formTitleHint: s.formTitleHint,
    formDescription: s.formDescription,
    formHtml: s.formHtml,
    formHtmlHint: s.formHtmlHint,
    formStartMedia: s.formStartMedia,
    formEndMedia: s.formEndMedia,
    formState: s.formState,
    formSave: s.formSave,
    formCancel: s.formCancel,
    defectsHeading: s.defectsHeading,
    defectsDescription: s.defectsDescription,
    defectAdd: s.defectAdd,
    defectRemove: s.defectRemove,
    defectCode: s.defectCode,
    defectTitle: s.defectTitle,
    defectLocation: s.defectLocation,
    defectExpected: s.defectExpected,
    defectReproduction: s.defectReproduction,
    defectSeverity: s.defectSeverity,
    defectsNone: s.defectsNone,
  };

  // `statusLabel` is the one DB-state → language mapping (WS-0). Never a second.
  const stateLabels = SCENARIO_STATES.map((value) => ({
    value,
    label: statusLabel(value, locale),
  }));

  const header = (
    <PageHeader
      title={s.title}
      description={s.subtitle}
      actions={
        <ScenarioEditor
          locale={locale}
          scenario={null}
          defects={[]}
          labels={editorLabels}
          stateLabels={stateLabels}
          trigger={s.new}
        />
      }
    />
  );

  if (!scenarios.ok) {
    return (
      <>
        {header}
        <ErrorState message={scenarios.error.message} />
      </>
    );
  }

  const counts = await countDefectsByScenario();
  const defectCounts = counts.ok ? counts.data : new Map<string, number>();

  const defectsById = new Map(
    await Promise.all(
      scenarios.data.map(async (scenario) => {
        const result = await listHuntScenarioDefects(scenario.id);
        return [scenario.id, result.ok ? result.data : []] as const;
      })
    )
  );

  return (
    <>
      {header}

      {scenarios.data.length === 0 ? (
        <EmptyState title={s.emptyTitle} description={s.emptyDescription} />
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {scenarios.data.map((scenario) => {
            // Which engine renders it. The database keeps these mutually
            // exclusive for an active scenario, so this is a fork, not a guess.
            const surfaces = scenario.configuration.surfaces;
            const mode =
              scenario.html && scenario.html.trim() !== ""
                ? s.modeHtml
                : Array.isArray(surfaces) && surfaces.length > 0
                  ? s.modeRegistry
                  : s.modeNone;

            return (
              <li key={scenario.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-semibold leading-6">{scenario.title}</h3>
                      <p className="text-[13px] text-(--color-fg-muted)">
                        {scenario.code} · v{scenario.scenarioVersion}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{mode}</Badge>
                      <StatusBadge state={scenario.state} locale={locale} />
                    </div>
                  </div>

                  <p className="text-[13px] text-(--color-fg-muted)">
                    {s.columnDefects}: {defectCounts.get(scenario.id) ?? 0}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <ScenarioEditor
                      locale={locale}
                      scenario={scenario}
                      defects={defectsById.get(scenario.id) ?? []}
                      labels={editorLabels}
                      stateLabels={stateLabels}
                      trigger={s.edit}
                    />
                    {/* §1.7: "The admin can preview." Straight to the learner's
                        own sandbox route, so the preview cannot drift from what
                        a learner actually sees. */}
                    <Link
                      href={`/${locale}/arena/sandbox/${scenario.code}` as Route}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Eye className="size-4" aria-hidden />}
                      >
                        {s.preview}
                      </Button>
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
