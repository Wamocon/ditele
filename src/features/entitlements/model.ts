import { z } from "zod";

import { RECORD_STATES } from "@/entities/common/persistence-states";

export const FeatureCodeSchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_.:-]*$/);
export type FeatureCode = z.infer<typeof FeatureCodeSchema>;

export const ProductPackageStateSchema = z.enum(RECORD_STATES);

export const ProductPackageSchema = z.object({
  id: z.string().min(1),
  code: z.string().regex(/^[a-z0-9_-]+$/),
  title: z.string().trim().min(1).max(160),
  state: ProductPackageStateSchema,
  capabilities: z.array(FeatureCodeSchema),
}).strict();
export type ProductPackage = z.infer<typeof ProductPackageSchema>;

export const EntitlementGrantSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().min(1).nullable(),
  organizationId: z.string().min(1),
  packageId: z.string().min(1),
  capability: FeatureCodeSchema,
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().nullable(),
}).strict();
export type EntitlementGrant = z.infer<typeof EntitlementGrantSchema>;

export const EntitlementDecisionSchema = z.discriminatedUnion("allowed", [
  z.object({ allowed: z.literal(true), grantId: z.string().min(1), packageId: z.string().min(1) }),
  z.object({ allowed: z.literal(false), reason: z.enum(["not_entitled", "expired", "package_unavailable"]) }),
]);
export type EntitlementDecision = z.infer<typeof EntitlementDecisionSchema>;
