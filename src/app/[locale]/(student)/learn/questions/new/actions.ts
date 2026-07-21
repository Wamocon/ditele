"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import { askQuestion } from "@/shared/data/questions";
import { getWs3Messages } from "@/features/questions/i18n";

export interface AskQuestionState {
  error: string | null;
  fieldErrors: { context?: string; subject?: string; body?: string };
  /** Echoed back so a validation error never wipes what was typed. */
  values: { context: string; subject: string; body: string };
}

/**
 * ⚠️ The initial state is declared in the client component, not here. A
 * `"use server"` module may export **only async functions**; anything else
 * reads as `undefined` on the client and the page fails during SSR while still
 * answering 200.
 */

const SUBJECT_MAX = 200;
const BODY_MAX = 4000;

export async function askQuestionAction(
  _previous: AskQuestionState,
  formData: FormData
): Promise<AskQuestionState> {
  const locale = String(formData.get("locale") ?? "de");
  // A layout guard does not protect a POST — every action re-checks.
  await requireRole(["student", "trainer", "admin"], locale);

  const t = (await getWs3Messages(locale)).learn.questionNew;

  const context = String(formData.get("context") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const values = { context, subject, body };

  const fieldErrors: AskQuestionState["fieldErrors"] = {};
  // The picker packs both ids into one option value — the RPC needs the cohort
  // as well as the task, and they always travel together.
  const [taskId, cohortId] = context.split("|");
  if (!taskId || !cohortId) fieldErrors.context = t.errorContextRequired;
  if (!subject) fieldErrors.subject = t.errorSubjectRequired;
  else if (subject.length > SUBJECT_MAX) fieldErrors.subject = t.errorSubjectTooLong;
  if (!body) fieldErrors.body = t.errorBodyRequired;
  else if (body.length > BODY_MAX) fieldErrors.body = t.errorBodyTooLong;

  if (Object.keys(fieldErrors).length > 0 || !taskId || !cohortId) {
    return { error: null, fieldErrors, values };
  }

  const result = await askQuestion({ taskId, cohortId, subject, body });
  if (!result.ok) {
    return { error: result.error.message, fieldErrors: {}, values };
  }

  revalidatePath(`/${locale}/learn/questions`);
  redirect(`/${locale}/learn/questions/${result.data.id}`);
}
