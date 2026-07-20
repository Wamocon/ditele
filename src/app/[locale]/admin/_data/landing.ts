import type { AppRole } from "@/shared/auth/types";

export function adminLandingForRoles(
  roles: readonly AppRole[],
): "/admin" | "/admin/courses" | null {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("content_admin")) return "/admin/courses";
  return null;
}
