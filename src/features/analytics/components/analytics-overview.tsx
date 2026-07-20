import { StatePanel } from "@/shared/ui/state-panel";

import type { AnalyticsMetric } from "../model";

export function AnalyticsOverview({ metrics, available, labels }: { metrics: readonly AnalyticsMetric[]; available: boolean; labels: { title: string; unavailableTitle: string; unavailableDescription: string } }) {
  if (!available) return <StatePanel title={labels.unavailableTitle} description={labels.unavailableDescription} />;
  return <section aria-labelledby="analytics-title" className="stack"><h2 id="analytics-title">{labels.title}</h2><dl className="stack">{metrics.map((metric) => <div className="panel" key={metric.key}><dt>{metric.definition}</dt><dd>{metric.value}</dd></div>)}</dl></section>;
}
