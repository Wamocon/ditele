import { Badge } from "@/shared/ui/badge";

import type { Enrollment } from "../model/enrollment";

interface EnrollmentStatusProps {
  enrollment: Enrollment;
  labels: EnrollmentStatusLabels;
}

export interface EnrollmentStatusLabels {
  heading: string;
  reason: string;
  states: Record<Enrollment["state"], { name: string; description: string }>;
}

const TONE: Record<Enrollment["state"], "neutral" | "success" | "warning" | "danger"> = {
  requested: "warning",
  approved: "success",
  rejected: "danger",
  assigned: "success",
  cancelled: "neutral",
  completed: "success",
};

export function EnrollmentStatus({ enrollment, labels }: EnrollmentStatusProps) {
  return (
    <section aria-labelledby={`enrollment-${enrollment.id}`} className="panel stack">
      <div className="cluster">
        <h2 id={`enrollment-${enrollment.id}`}>{labels.heading}</h2>
        <Badge tone={TONE[enrollment.state]}>{labels.states[enrollment.state].name}</Badge>
      </div>
      <p className="muted" role="status">{labels.states[enrollment.state].description}</p>
      {enrollment.decisionReason ? (
        <p>
          <strong>{labels.reason}:</strong> {enrollment.decisionReason}
        </p>
      ) : null}
    </section>
  );
}
