"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button, Card, EmptyState } from "@/shared/ui";
import { addStageAction, type ActionState } from "../actions";
import type { AdminStrings } from "../i18n";
import { buildReadiness, isVersionEditable, type StudioWorkspace } from "../model";
import { LifecycleBar } from "./lifecycle-bar";
import { StageCard } from "./stage-card";

/**
 * The studio root. Server Components fetch, this holds only the transient bits
 * (which task is expanded, which delete is being confirmed); every mutation goes
 * through a Server Action that revalidates the route.
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
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const readOnly = !isVersionEditable(workspace.versionState);
  const checks = buildReadiness(workspace);
  const stageOrder = workspace.stages.map((stage) => stage.id);
  const approved =
    workspace.versionState === "in_review" && workspace.latestReview?.decision === "approved";

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

      <LifecycleBar
        locale={locale}
        courseId={workspace.courseId}
        versionId={workspace.versionId}
        versionState={workspace.versionState}
        approved={Boolean(approved)}
        checks={checks}
        strings={strings}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[22px] font-semibold leading-7">{s.stages}</h2>
          {!readOnly && (
            <Button
              variant="outline"
              loading={pending}
              iconLeft={<Plus className="size-4" aria-hidden />}
              onClick={() =>
                startTransition(async () => {
                  setState(
                    await addStageAction({
                      locale,
                      courseId: workspace.courseId,
                      versionId: workspace.versionId,
                    })
                  );
                })
              }
            >
              {s.stageAdd}
            </Button>
          )}
        </div>

        {state.status === "error" && (
          <p
            role="alert"
            className="rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger)"
          >
            {state.message}
          </p>
        )}

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
                stageOrder={stageOrder}
                skills={workspace.skills}
                strings={strings}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
