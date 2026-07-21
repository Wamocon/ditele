"use client";

import { useEffect, useRef } from "react";
import { EmptyState } from "@/shared/ui";
import { SandboxProvider } from "./defect-context";
import { SURFACE_REGISTRY } from "./registry";
import { SANDBOX_REGION_ATTRIBUTE, publishRegion } from "./capture";
import type { ScenarioConfiguration } from "./model";
import type { ArenaSandboxStrings } from "./i18n";

/**
 * Renders one scenario: its surfaces, in its layout, with its defects armed.
 *
 * Everything this component knows about the scenario arrived as data. There is
 * no branch on a scenario code anywhere in this file, and if one ever appears
 * the engine has failed at its single job.
 */

export interface SandboxRuntimeProps {
  configuration: ScenarioConfiguration;
  /** `false` disarms every effect — the clean baseline. Author-only. */
  defectsEnabled: boolean;
  strings: ArenaSandboxStrings;
}

export function SandboxRuntime({ configuration, defectsEnabled, strings }: SandboxRuntimeProps) {
  const regionRef = useRef<HTMLDivElement>(null);

  // Tell whoever framed us where the sandbox actually sits, so a capture taken
  // in the parent document can be cropped to it. Same-origin makes this
  // unnecessary in principle — the parent could measure the element itself —
  // but a message costs nothing and spares WS-10 reaching through
  // `contentWindow` into a DOM it does not own.
  useEffect(() => publishRegion(regionRef.current), []);

  const main = configuration.surfaces.filter((surface) => surface.column === "main");
  const aside = configuration.surfaces.filter((surface) => surface.column === "aside");

  if (configuration.surfaces.length === 0) {
    return <EmptyState title={strings.emptyTitle} description={strings.emptyDescription} />;
  }

  return (
    <SandboxProvider configuration={configuration} defectsEnabled={defectsEnabled}>
      <div
        ref={regionRef}
        {...{ [SANDBOX_REGION_ATTRIBUTE]: "" }}
        className="flex flex-col gap-6 lg:flex-row lg:items-start"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {main.map((surface) => (
            <Surface key={surface.id} surface={surface} />
          ))}
        </div>
        {aside.length > 0 && (
          <div className="flex w-full flex-col gap-6 lg:w-80 lg:shrink-0">
            {aside.map((surface) => (
              <Surface key={surface.id} surface={surface} />
            ))}
          </div>
        )}
      </div>
    </SandboxProvider>
  );
}

function Surface({ surface }: { surface: ScenarioConfiguration["surfaces"][number] }) {
  const Component = SURFACE_REGISTRY[surface.component];
  // Unreachable through the route: `parseScenarioConfiguration` refuses a
  // scenario naming an unknown component, and the route refuses to render one
  // with errors. Kept because this component is also usable directly, and a
  // blank hole in a sandbox is the single most expensive thing that can happen
  // here — a learner cannot tell it from a planted bug.
  if (!Component) return null;
  return <Component surfaceId={surface.id} content={surface.content} />;
}
