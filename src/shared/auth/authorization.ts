import type { AppRole, Principal } from "./types";

export function hasRole(principal: Principal, role: AppRole): boolean {
  return principal.role === role;
}

export function isAdmin(principal: Principal): boolean {
  return principal.role === "admin";
}

export function isTrainer(principal: Principal): boolean {
  return principal.role === "trainer";
}

export function isStudent(principal: Principal): boolean {
  return principal.role === "student";
}

/** Trainer or admin — the staff side that reviews work and reads answer keys. */
export function isStaff(principal: Principal): boolean {
  return principal.role === "admin" || principal.role === "trainer";
}
