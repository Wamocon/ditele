import type { ReactNode } from "react";

import { StatePanel } from "@/shared/ui/state-panel";

import type { EntitlementDecision } from "../model";

export function EntitlementGate({ decision, children, labels }: { decision: EntitlementDecision; children: ReactNode; labels: Record<"not_entitled" | "expired" | "package_unavailable", { title: string; description: string }> }) {
  if (decision.allowed) return children;
  return <StatePanel title={labels[decision.reason].title} description={labels[decision.reason].description} />;
}
