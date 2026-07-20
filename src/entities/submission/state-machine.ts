import type { TransitionMap } from "../common/state-machine";

export const SUBMISSION_STATES = [
  "submitted",
  "revision_required",
  "resubmitted",
  "accepted",
  "withdrawn",
] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

export const submissionTransitions = {
  submitted: ["accepted", "revision_required", "withdrawn"],
  revision_required: ["resubmitted"],
  resubmitted: ["accepted", "revision_required", "withdrawn"],
  accepted: [],
  withdrawn: [],
} as const satisfies TransitionMap<SubmissionState>;

