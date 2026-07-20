import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { BadgeRule, XpLedgerEntry } from "../model";

export function GamificationSummary({ entries, badges, enabled, labels }: { entries: readonly XpLedgerEntry[]; badges: readonly BadgeRule[]; enabled: boolean; labels: { title: string; unavailableTitle: string; unavailableDescription: string; xp(value: number): string } }) {
  if (!enabled) return <StatePanel title={labels.unavailableTitle} description={labels.unavailableDescription} />;
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return <section aria-labelledby="gamification-title" className="panel stack"><h2 id="gamification-title">{labels.title}</h2><p>{labels.xp(total)}</p><div className="cluster">{badges.map((badge) => <Badge key={badge.id} tone="success">{badge.title}</Badge>)}</div></section>;
}
