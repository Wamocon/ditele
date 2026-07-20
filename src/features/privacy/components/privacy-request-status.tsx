import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { PrivacyRequest } from "../model";

export function PrivacyRequestStatus({ request, labels }: { request: PrivacyRequest | null; labels: { emptyTitle: string; emptyDescription: string; title: string; states: Record<PrivacyRequest["state"], string> } }) {
  if (!request) return <StatePanel title={labels.emptyTitle} description={labels.emptyDescription} />;
  return <section aria-labelledby="privacy-request-title" className="panel stack"><h2 id="privacy-request-title">{labels.title}</h2><Badge tone={request.state === "rejected" ? "danger" : request.state === "completed" ? "success" : "neutral"}>{labels.states[request.state]}</Badge></section>;
}
