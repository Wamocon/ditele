import "server-only";

import { z } from "zod";

import { PublicEnvironmentSchema } from "@/shared/config/env";

const ServerEnvironmentSchema = PublicEnvironmentSchema.extend({
  DITELE_APP_ORIGIN: z.url(),
  DITELE_DATA_MODE: z.enum(["supabase", "fixture"]).default("supabase"),
  DITELE_AI_PROVIDER: z.enum(["disabled"]).default("disabled"),
  DITELE_LAB_PROVIDER: z.enum(["disabled"]).default("disabled"),
  DITELE_INTEGRATION_PROVIDER: z.enum(["disabled"]).default("disabled"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional()
});

export type ServerEnvironment = z.infer<typeof ServerEnvironmentSchema>;

export function getServerEnvironment(): ServerEnvironment {
  return ServerEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    DITELE_APP_ORIGIN: process.env.DITELE_APP_ORIGIN,
    DITELE_DATA_MODE: process.env.DITELE_DATA_MODE,
    DITELE_AI_PROVIDER: process.env.DITELE_AI_PROVIDER,
    DITELE_LAB_PROVIDER: process.env.DITELE_LAB_PROVIDER,
    DITELE_INTEGRATION_PROVIDER: process.env.DITELE_INTEGRATION_PROVIDER,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  });
}
