"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { createServerClient } from "@/shared/database/server";
import { isLocale } from "@/shared/i18n/config";

const RequestSchema = z.object({
  locale: z.string().refine(isLocale),
  courseId: z.string().uuid(),
  idempotencyKey: z.string().min(12).max(128),
  note: z.string().trim().max(1000).default(""),
});

export async function requestEnrollmentAction(formData: FormData): Promise<void> {
  const input = RequestSchema.parse(Object.fromEntries(formData));
  const principal = await getPrincipal();
  if (!principal.roles.includes("learner")) {
    throw new Error("enrollment.forbidden");
  }

  const client = await createServerClient();
  const { error } = await client.rpc("request_enrollment", {
    p_course_id: input.courseId,
    p_idempotency_key: input.idempotencyKey,
    p_request_note: input.note,
  });
  if (error) {
    throw new Error("enrollment.request_failed", { cause: error });
  }

  revalidatePath(`/${input.locale}/learn`);
  redirect(`/${input.locale}/learn` as Route);
}
