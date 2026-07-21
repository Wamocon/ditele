"use client";

import { useActionState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { FormStatus } from "@/features/questions/components/form-status";
import { SubmitButton } from "@/features/questions/components/submit-button";
import {
  markAllReadAction,
  markReadAction,
  type NotificationActionState,
} from "./actions";

const INITIAL: NotificationActionState = { error: null };

export function MarkAllReadForm({ locale, label }: { locale: string; label: string }) {
  const [state, action] = useActionState(markAllReadAction, INITIAL);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="locale" value={locale} />
      <SubmitButton variant="outline" size="sm" iconLeft={<CheckCheck className="size-4" aria-hidden />}>
        {label}
      </SubmitButton>
      <FormStatus tone="error" message={state.error} />
    </form>
  );
}

export function MarkReadForm({
  locale,
  notificationId,
  label,
}: {
  locale: string;
  notificationId: string;
  label: string;
}) {
  const [state, action] = useActionState(markReadAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="notificationId" value={notificationId} />
      <SubmitButton variant="ghost" size="sm" iconLeft={<Check className="size-4" aria-hidden />}>
        {label}
      </SubmitButton>
      <FormStatus tone="error" message={state.error} />
    </form>
  );
}
