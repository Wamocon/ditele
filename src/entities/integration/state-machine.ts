import type { TransitionMap } from "../common/state-machine";

export const DELIVERY_STATES = [
  "pending",
  "processing",
  "delivered",
  "retry_scheduled",
  "dead_letter",
  "cancelled",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const deliveryTransitions = {
  pending: ["processing", "cancelled"],
  processing: ["delivered", "retry_scheduled", "dead_letter"],
  delivered: [],
  retry_scheduled: ["processing", "dead_letter", "cancelled"],
  dead_letter: ["retry_scheduled"],
  cancelled: [],
} as const satisfies TransitionMap<DeliveryState>;

