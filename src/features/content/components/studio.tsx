"use client";

import { Card, EmptyState } from "@/shared/ui";
import type { AdminStrings } from "../i18n";
import { isVersionEditable, type StudioWorkspace } from "../model";
import { StageCard } from "./stage-card";

/**
 * The studio root. Server Components fetch, this holds only the transient bits
 * (which task is expanded, which delete is being confirmed); every mutation goes
 * through a Server Action that revalidates the route.
 *
 * Stages are no longer author-facing: a course is a flat list of tasks. Every
 * version carries exactly one hidden stage (created with it), and each StageCard
 * renders `flat` — its stage chrome stripped away — so the studio shows the
 * course's tasks directly, with "Add task" and "Add existing task". The stage
 * still exists in the database, because tasks require a stage_id and the whole
 * snapshot/lock pipeline is built around it; it is simply never shown.
 */
export function Studio({
  locale,
  workspace,
  strings,
}: {
  locale: string;
  workspace: StudioWorkspace;
  strings: AdminStrings;
}) {
  const s = strings.studio;
  const readOnly = !isVersionEditable(workspace.versionState);

  return (
    <div className="flex flex-col gap-5">
      {readOnly && (
        <Card className="border-(--color-info) bg-(--color-info-soft)">
          <p className="text-[15px] font-semibold text-(--color-info)">{s.readOnly}</p>
          <p className="mt-1 text-[13px] leading-5 text-(--color-fg-muted)">
            {s.readOnlyDescription}
          </p>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[22px] font-semibold leading-7">{s.tasks}</h2>

        {workspace.stages.length === 0 ? (
          <EmptyState title={s.stagesEmptyTitle} description={s.stagesEmptyDescription} />
        ) : (
          <div className="flex flex-col gap-4">
            {workspace.stages.map((stage) => (
              <StageCard
                key={stage.id}
                locale={locale}
                courseId={workspace.courseId}
                versionId={workspace.versionId}
                stage={stage}
                stageOrder={workspace.stages.map((item) => item.id)}
                scenarios={workspace.scenarios ?? []}
                strings={strings}
                readOnly={readOnly}
                flat
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
