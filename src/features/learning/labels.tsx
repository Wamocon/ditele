import { Badge, type BadgeProps } from "@/shared/ui";
import type { Enums } from "@/shared/database/database.types";
import type { CourseLockReason } from "@/shared/data/unlock";

type SubmissionState = Enums<"submission_state">;
type Tone = NonNullable<BadgeProps["tone"]>;

/**
 * German labels for a course/arena submission state. The shared StatusBadge maps
 * a different (older) enum, so the learner vertical keeps its own tiny mapping
 * that matches `submission_state` exactly — including `needs_revision`.
 */
const SUBMISSION_STATE: Record<SubmissionState, { label: string; tone: Tone }> = {
  in_progress: { label: "In Bearbeitung", tone: "info" },
  submitted: { label: "Eingereicht", tone: "info" },
  accepted: { label: "Angenommen", tone: "success" },
  needs_revision: { label: "Überarbeitung nötig", tone: "warning" },
};

export function submissionStateLabel(state: SubmissionState | null): string {
  return state ? SUBMISSION_STATE[state].label : "Nicht begonnen";
}

export function TaskStatusBadge({ state }: { state: SubmissionState | null }) {
  if (!state) {
    return (
      <Badge tone="neutral" dot>
        Nicht begonnen
      </Badge>
    );
  }
  const entry = SUBMISSION_STATE[state];
  return (
    <Badge tone={entry.tone} dot>
      {entry.label}
    </Badge>
  );
}

/** Why a course task is still locked — the two chain conditions, in German. */
export function lockReasonText(reason: CourseLockReason): string {
  switch (reason) {
    case "arena":
      return "Zuerst die verknüpfte Arena-Aufgabe abschließen.";
    case "previous_question":
      return "Zuerst die vorherige Aufgabe beantworten.";
    default:
      return "Noch gesperrt.";
  }
}
