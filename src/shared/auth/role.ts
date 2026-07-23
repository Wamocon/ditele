import type { AppRole } from "./types";

/** The three roles. Same set the DB uses now, so this is just an alias. */
export type UiRole = "student" | "trainer" | "admin";

export function toUiRole(role: AppRole): UiRole {
  return role;
}

/** Where each role lands after login. */
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
