import type { ReactNode } from "react";
import { Badge, cn } from "@/shared/ui";
import { SandboxCaptureButton } from "./capture-button";
import { formatString, type ArenaSandboxStrings } from "./i18n";

/**
 * The chrome around a scenario: what it is, that it is deliberately broken,
 * and the capture control.
 *
 * ⚠️ Everything in this component is **interface** and switches de/en/ru.
 * Everything inside `children` is **course material** and stays German. That
 * boundary is the whole reason the frame is a separate component from the
 * runtime — see the header of `i18n.ts`.
 *
 * The frame is visually distinct from the surfaces it holds so a learner can
 * always tell "this is DiTeLe telling me something" from "this is the
 * application I am testing". Without that line, our own chrome becomes a
 * source of false bug reports.
 */

export interface SandboxFrameProps {
  strings: ArenaSandboxStrings;
  scenarioCode: string;
  scenarioVersion: number;
  /** GERMAN. The scenario's own name for the app under test. */
  appName: string;
  /** GERMAN. Course material — the scenario description from the database. */
  description: string;
  defectsEnabled: boolean;
  authoring: boolean;
  /**
   * `true` when the page is rendered inside the task workspace's frame. The
   * frame then covers the DiTeLe shell instead of sitting under a second
   * header — a header inside a header reads as a layout bug, and a layout bug
   * inside a bug hunt costs a trainer a review.
   */
  embedded: boolean;
  children: ReactNode;
}

export function SandboxFrame({
  strings,
  scenarioCode,
  scenarioVersion,
  appName,
  description,
  defectsEnabled,
  authoring,
  embedded,
  children,
}: SandboxFrameProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        // Fixed rather than a negative margin: the student layout's shell is a
        // flex column with a sticky header (z-40) and a fixed mobile tab bar
        // (z-40), and nothing short of leaving the flow gets out from under
        // both. Driven by an explicit `?embed=1` and not by sniffing
        // `window.top`, so the very first server render is already right and
        // there is no hydration flash — "no layout shift on load" is on the
        // checklist this component exists to satisfy.
        embedded && "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-(--color-bg) p-4 lg:p-6",
      )}
    >
      <header className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-2) p-3 lg:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">{strings.frameLabel}</Badge>
          {authoring && <Badge tone="info">{strings.authoringLabel}</Badge>}
          {authoring && !defectsEnabled && (
            <Badge tone="neutral">{strings.defectsDisabledLabel}</Badge>
          )}
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">
            {formatString(strings.scenarioMeta, {
              code: scenarioCode,
              version: scenarioVersion,
            })}
          </p>
        </div>

        {appName !== "" && <h1 className="text-[20px] font-semibold leading-7">{appName}</h1>}
        {description !== "" && (
          <p className="max-w-prose text-[14px] leading-6 text-(--color-fg-muted)">{description}</p>
        )}
        <p className="max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">
          {strings.frameHint}
        </p>

        <SandboxCaptureButton strings={strings} scenarioCode={scenarioCode} />
      </header>

      {children}
    </div>
  );
}
