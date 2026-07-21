import type { AppRole } from "./types";

/**
 * The database keeps 8 roles. The UI shows 3.
 * This mapping is written once, here, and everyone imports it.
 * MASTER_PLAN §9.2.
 */
export type UiRole = "student" | "trainer" | "admin";

const ROLE_MAP: Record<AppRole, UiRole> = {
  learner: "student",
  trainer: "trainer",
  admin: "admin",
  content_admin: "admin", // authoring lives in the admin shell
  organization_admin: "admin",
  support: "admin",
  integration_admin: "admin",
  dpo: "admin",
};

/** Highest wins: admin > trainer > student. */
const PRECEDENCE: readonly UiRole[] = ["admin", "trainer", "student"];

export function toUiRole(roles: readonly AppRole[]): UiRole {
  const mapped = new Set(roles.map((r) => ROLE_MAP[r]).filter(Boolean));
  return PRECEDENCE.find((r) => mapped.has(r)) ?? "student";
}

/** Where each role lands after login. MASTER_PLAN §11.2. */
export function postAuthDestination(role: UiRole): "/learn" | "/trainer" | "/admin" {
  switch (role) {
    case "admin":
      return "/admin";
    case "trainer":
      return "/trainer";
    default:
      return "/learn";
  }
}

export const UI_ROLE_LABEL: Record<UiRole, string> = {
  student: "Teilnehmer",
  trainer: "Trainer",
  admin: "Administrator",
};
