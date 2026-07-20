import type { TransitionMap } from "../common/state-machine";

export const LAB_SESSION_STATES = [
  "requested",
  "provisioning",
  "ready",
  "active",
  "validating",
  "reset_pending",
  "destroy_pending",
  "destroyed",
  "failed",
  "expired",
] as const;
export type LabSessionState = (typeof LAB_SESSION_STATES)[number];

export const labSessionTransitions = {
  requested: ["provisioning", "failed", "destroyed"],
  provisioning: ["ready", "destroy_pending", "destroyed", "failed"],
  ready: ["active", "reset_pending", "destroy_pending", "expired"],
  active: ["validating", "reset_pending", "destroy_pending", "expired", "failed"],
  validating: ["active", "destroy_pending", "failed"],
  reset_pending: ["ready", "destroy_pending", "failed"],
  destroy_pending: ["destroyed", "failed"],
  destroyed: [],
  failed: ["provisioning", "destroy_pending", "destroyed"],
  expired: ["destroy_pending"],
} as const satisfies TransitionMap<LabSessionState>;
