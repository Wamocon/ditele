"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { createServerClient } from "@/shared/database/server";
import { isLocale } from "@/shared/i18n/config";

const DecisionSchema = z.object({
  locale: z.string().refine(isLocale),
  enrollmentId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(1000),
});

export async function decideEnrollmentAction(formData: FormData): Promise<void> {
  const input = DecisionSchema.parse(Object.fromEntries(formData));
  const principal = await getPrincipal();
  if (!principal.roles.includes("admin")) {
    throw new Error("enrollment.decision_forbidden");
  }

  const client = await createServerClient();
  const { error } = await client.rpc("decide_enrollment", {
    p_correlation_id: randomUUID(),
    p_decision: input.decision,
    p_enrollment_id: input.enrollmentId,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason,
  });
  if (error) {
    throw new Error("enrollment.decision_failed", { cause: error });
  }

  revalidatePath(`/${input.locale}/admin`);
  revalidatePath(`/${input.locale}/admin/applications`);
}
