import { z } from "zod";

// Authentication accepts any non-empty credential that may already be valid at
// the identity provider. Strength requirements apply only when creating or
// replacing a password.
export const existingPasswordSchema = z.string().min(1).max(200);

export const newPasswordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/u)
  .regex(/[A-Z]/u)
  .regex(/[0-9]/u)
  .regex(/[^A-Za-z0-9]/u);

export const NEW_PASSWORD_HTML_PATTERN =
  "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,128}";
