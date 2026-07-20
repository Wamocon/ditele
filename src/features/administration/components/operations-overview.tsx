import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { EnrollmentApplication, ExportJob, SupportIssue } from "../model";

export interface OperationsOverviewLabels {
  readonly title: string;
  readonly applications: string;
  readonly issues: string;
  readonly exports: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly applicationStates: Readonly<Record<EnrollmentApplication["state"], string>>;
  readonly issueStates: Readonly<Record<SupportIssue["state"], string>>;
  readonly exportStates: Readonly<Record<ExportJob["state"], string>>;
}

export interface OperationsOverviewProps {
  readonly applications: readonly EnrollmentApplication[];
  readonly issues: readonly SupportIssue[];
  readonly exports: readonly ExportJob[];
  readonly labels: OperationsOverviewLabels;
}

export function OperationsOverview({
  applications,
  issues,
  exports,
  labels,
}: OperationsOverviewProps) {
  const total = applications.length + issues.length + exports.length;
  if (total === 0) {
    return <StatePanel title={labels.emptyTitle} description={labels.emptyDescription} />;
  }
  return (
    <section className="stack" aria-labelledby="admin-operations-title">
      <h1 id="admin-operations-title">{labels.title}</h1>
      <div className="panel">
        <header className="panel__header"><h2>{labels.applications}</h2></header>
        <div className="panel__body stack">
          {applications.map((application) => (
            <div className="cluster" key={application.id}>
              <strong>{application.id}</strong>
              <Badge tone={application.state === "pending" ? "warning" : application.state === "accepted" ? "success" : "danger"}>
                {labels.applicationStates[application.state]}
              </Badge>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <header className="panel__header"><h2>{labels.issues}</h2></header>
        <div className="panel__body stack">
          {issues.map((issue) => (
            <div className="cluster" key={issue.id}>
              <strong>{issue.id}</strong>
              <Badge tone={issue.state === "resolved" || issue.state === "closed" ? "success" : "warning"}>
                {labels.issueStates[issue.state]}
              </Badge>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <header className="panel__header"><h2>{labels.exports}</h2></header>
        <div className="panel__body stack">
          {exports.map((job) => (
            <div className="cluster" key={job.id}>
              <strong>{job.kind}</strong>
              <Badge tone={job.state === "ready" ? "success" : job.state === "failed" ? "danger" : "neutral"}>
                {labels.exportStates[job.state]}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
