import { z } from "zod";

import { APP_ROLES } from "@/shared/auth/types";
import {
  existingPasswordSchema,
  newPasswordSchema,
} from "@/shared/auth/password-policy";

import { uuidSchema } from "./common";

export const appRoleSchema = z.enum(APP_ROLES);

export const sessionPrincipalSchema = z.object({
  userId: uuidSchema,
  sessionId: z.string().min(1),
  organizationId: uuidSchema.nullable(),
  primaryRole: appRoleSchema,
  roles: z.array(appRoleSchema).min(1),
  permissions: z.array(z.string().min(1)),
  cohortIds: z.array(uuidSchema),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: existingPasswordSchema,
});

export const registrationInputSchema = z.object({
  email: z.string().email(),
  password: newPasswordSchema,
  displayName: z.string().trim().min(1).max(160),
  locale: z.enum(["en", "de", "ru"]),
});

export type SessionPrincipal = z.infer<typeof sessionPrincipalSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type RegistrationInput = z.infer<typeof registrationInputSchema>;
