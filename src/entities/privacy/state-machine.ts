import type { TransitionMap } from "../common/state-machine";

export const PRIVACY_REQUEST_STATES = [
  "requested",
  "processing",
  "completed",
  "rejected",
  "cancelled",
] as const;
export type PrivacyRequestState = (typeof PRIVACY_REQUEST_STATES)[number];

export const privacyRequestTransitions = {
  requested: ["processing", "rejected", "cancelled"],
  processing: ["completed", "rejected", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
} as const satisfies TransitionMap<PrivacyRequestState>;
