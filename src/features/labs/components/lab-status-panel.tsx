import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { LabProviderAvailability, LabSession } from "../model";

export function LabStatusPanel({
  availability,
  session,
  labels,
}: {
  availability: LabProviderAvailability;
  session?: LabSession;
  labels: {
    title: string;
    unavailableTitle: string;
    unavailable: Record<"not_configured" | "temporarily_unavailable" | "capacity_exhausted", string>;
    states: Record<LabSession["state"], string>;
  };
}) {
  if (!availability.available) {
    return <StatePanel title={labels.unavailableTitle} description={labels.unavailable[availability.reason]} />;
  }
  return (
    <section aria-labelledby="lab-status-title" className="panel stack">
      <h2 id="lab-status-title">{labels.title}</h2>
      {session ? <Badge tone={session.state === "failed" ? "danger" : session.state === "ready" ? "success" : "neutral"}>{labels.states[session.state]}</Badge> : null}
    </section>
  );
}
