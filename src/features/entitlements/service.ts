import {
  EntitlementDecisionSchema,
  EntitlementGrantSchema,
  FeatureCodeSchema,
  ProductPackageSchema,
  type EntitlementDecision,
  type EntitlementGrant,
  type FeatureCode,
  type ProductPackage,
} from "./model";

export function resolveEntitlement(
  input: { subjectId: string; organizationId: string; feature: FeatureCode; now: Date },
  grantsInput: readonly EntitlementGrant[],
  packagesInput: readonly ProductPackage[],
): EntitlementDecision {
  const feature = FeatureCodeSchema.parse(input.feature);
  const grants = grantsInput.map((grant) => EntitlementGrantSchema.parse(grant));
  const packages = new Map(packagesInput.map((item) => {
    const productPackage = ProductPackageSchema.parse(item);
    return [productPackage.id, productPackage] as const;
  }));
  const matching = grants
    .filter((grant) => grant.capability === feature)
    .filter((grant) => grant.organizationId === input.organizationId)
    .filter((grant) => grant.subjectId === null || grant.subjectId === input.subjectId)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (matching.length === 0) return { allowed: false, reason: "not_entitled" };
  let fallback: EntitlementDecision = { allowed: false, reason: "not_entitled" };
  for (const grant of matching) {
    const productPackage = packages.get(grant.packageId);
    if (!productPackage || productPackage.state !== "active" || !productPackage.capabilities.includes(feature)) {
      fallback = { allowed: false, reason: "package_unavailable" };
      continue;
    }
    if (Date.parse(grant.validFrom) > input.now.getTime() || (grant.validUntil && Date.parse(grant.validUntil) <= input.now.getTime())) {
      fallback = { allowed: false, reason: "expired" };
      continue;
    }
    return EntitlementDecisionSchema.parse({ allowed: true, grantId: grant.id, packageId: grant.packageId });
  }
  return EntitlementDecisionSchema.parse(fallback);
}
