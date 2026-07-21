"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import { requestCourseEnrollment } from "@/shared/data/profile";
import { getWs3Messages } from "@/features/questions/i18n";

export interface EnrollFormState {
  error: string | null;
  success: string | null;
}

/**
 * ⚠️ No initial-state constant here — a `"use server"` module may export only
 * async functions. It is declared in the client component.
 */
export async function requestEnrollmentAction(
  _previous: EnrollFormState,
  formData: FormData
): Promise<EnrollFormState> {
  const locale = String(formData.get("locale") ?? "de");
  // A layout guard does not protect a POST.
  await requireRole(["student", "trainer", "admin"], locale);

  const messages = await getWs3Messages(locale);
  const t = messages.learn.enroll;

  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return { error: messages.learn.shared.invalidRequest, success: null };

  const note = String(formData.get("note") ?? "");

  const result = await requestCourseEnrollment({ courseId, requestNote: note });
  if (!result.ok) {
    // 42501 here means the account holds no `entitlements` row for this
    // catalog — not a bug in the form (ISSUES.md I-004 / I-005).
    return {
      error: result.error.code === "42501" ? t.lockedDescription : result.error.message,
      success: null,
    };
  }

  revalidatePath(`/${locale}/learn/enroll/${courseId}`);
  revalidatePath(`/${locale}/learn`);
  return { error: null, success: t.requested };
}
