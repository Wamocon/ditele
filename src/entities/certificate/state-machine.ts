import type { TransitionMap } from "../common/state-machine";

export const CERTIFICATE_STATES = [
  "eligible",
  "issued",
  "available",
  "revoked",
  "expired",
] as const;
export type CertificateState = (typeof CERTIFICATE_STATES)[number];

export const certificateTransitions = {
  eligible: ["issued"],
  issued: ["available", "revoked"],
  available: ["revoked", "expired"],
  revoked: [],
  expired: [],
} as const satisfies TransitionMap<CertificateState>;

