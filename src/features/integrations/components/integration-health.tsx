import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { IntegrationHealth } from "../model";

export function IntegrationHealthPanel({ health, labels }: { health: IntegrationHealth | null; labels: { title: string; unavailableTitle: string; unavailableDescription: string; statuses: Record<IntegrationHealth["status"], string>; pending(value: number): string; deadLetters(value: number): string } }) {
  if (!health) return <StatePanel title={labels.unavailableTitle} description={labels.unavailableDescription} />;
  return <section aria-labelledby="integration-health-title" className="panel stack"><h2 id="integration-health-title">{labels.title}</h2><Badge tone={health.status === "healthy" ? "success" : health.status === "degraded" ? "warning" : "danger"}>{labels.statuses[health.status]}</Badge><p>{labels.pending(health.pendingCount)}</p><p>{labels.deadLetters(health.deadLetterCount)}</p></section>;
}
