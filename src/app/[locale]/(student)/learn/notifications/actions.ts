"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/shared/auth/guard";
import {
  markEveryNotificationRead,
  markOneNotificationRead,
} from "@/shared/data/notifications";
import { getWs3Messages } from "@/features/questions/i18n";

/**
 * A layout guard does not protect a POST (MASTER_PLAN §9.3), so every action
 * re-checks the role. The database is still the real boundary underneath:
 * RLS only ever exposes the caller's own notifications.
 */
async function guard(locale: string): Promise<void> {
  await requireRole(["student", "trainer", "admin"], locale);
}

export interface NotificationActionState {
  error: string | null;
}

export async function markReadAction(
  _previous: NotificationActionState,
  formData: FormData
): Promise<NotificationActionState> {
  const locale = String(formData.get("locale") ?? "de");
  await guard(locale);

  const id = String(formData.get("notificationId") ?? "");
  if (!id) {
    return { error: (await getWs3Messages(locale)).learn.shared.invalidRequest };
  }

  const result = await markOneNotificationRead(id);
  if (!result.ok) return { error: result.error.message };

  revalidatePath(`/${locale}/learn/notifications`);
  return { error: null };
}

export async function markAllReadAction(
  _previous: NotificationActionState,
  formData: FormData
): Promise<NotificationActionState> {
  const locale = String(formData.get("locale") ?? "de");
  await guard(locale);

  const result = await markEveryNotificationRead();
  if (!result.ok) return { error: result.error.message };

  revalidatePath(`/${locale}/learn/notifications`);
  return { error: null };
}
