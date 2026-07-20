import { z } from "zod";

import {
  MEMBERSHIP_STATES,
  ORGANIZATION_STATES,
} from "@/entities/common/persistence-states";

export const OrganizationStateSchema = z.enum(ORGANIZATION_STATES);
export const OrganizationMembershipStateSchema = z.enum(MEMBERSHIP_STATES);

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(180),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  state: OrganizationStateSchema,
  createdAt: z.string().datetime(),
}).strict();
export type Organization = z.infer<typeof OrganizationSchema>;

export const OrganizationMembershipSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["member", "manager", "organization_admin"]),
  state: OrganizationMembershipStateSchema,
  version: z.number().int().positive(),
}).strict();
export type OrganizationMembership = z.infer<typeof OrganizationMembershipSchema>;

export const InviteOrganizationMemberInputSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().email().max(254),
  role: z.enum(["member", "manager", "organization_admin"]),
  idempotencyKey: z.string().trim().min(12).max(128),
});
export type InviteOrganizationMemberInput = z.infer<typeof InviteOrganizationMemberInputSchema>;

export const SsoConnectionSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  protocol: z.literal("oidc"),
  issuer: z.string().url(),
  clientId: z.string().trim().min(1).max(200),
  status: z.enum(["draft", "ready", "disabled", "provider_unavailable"]),
  domainHint: z.string().trim().min(1).max(253).nullable(),
});
export type SsoConnection = z.infer<typeof SsoConnectionSchema>;
