export const RECORD_STATES = ["draft", "active", "inactive", "archived"] as const;
export type RecordState = (typeof RECORD_STATES)[number];

export const ORGANIZATION_STATES = ["active", "suspended", "archived"] as const;
export type OrganizationState = (typeof ORGANIZATION_STATES)[number];

export const MEMBERSHIP_STATES = ["invited", "active", "suspended", "removed"] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export const AI_MODES = [
  "recommendation",
  "learning",
  "assessment",
  "trainer_draft",
] as const;
export type AiMode = (typeof AI_MODES)[number];
