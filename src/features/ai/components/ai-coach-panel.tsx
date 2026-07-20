import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { AiCoachOutcome } from "../model";

export function AiCoachPanel({ outcome, labels }: { outcome: AiCoachOutcome | null; labels: { title: string; idleDescription: string; refused: string; unavailable: string; citations: string } }) {
  if (!outcome) return <StatePanel title={labels.title} description={labels.idleDescription} />;
  if (outcome.status === "refused") return <StatePanel title={labels.refused} description={outcome.reason} tone="danger" />;
  if (outcome.status === "unavailable") return <StatePanel title={labels.unavailable} description={outcome.reason} />;
  return <section aria-labelledby="ai-coach-title" className="panel stack"><h2 id="ai-coach-title">{labels.title}</h2><p>{outcome.message}</p><Badge>{`${labels.citations}: ${outcome.citations.length}`}</Badge></section>;
}
