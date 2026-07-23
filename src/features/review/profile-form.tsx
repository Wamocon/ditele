"use client";

import { useActionState, useState } from "react";

import { Button, Card, Input } from "@/shared/ui";
import { updateTrainerProfileAction } from "./actions";
import { initialProfileState } from "./action-state";

/** The trainer's own profile: display name and avatar URL. */
export function ProfileForm({
  locale,
  email,
  displayName,
  avatarUrl,
}: {
  locale: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}) {
  const [state, formAction, isPending] = useActionState(updateTrainerProfileAction, initialProfileState);
  const [preview, setPreview] = useState(avatarUrl ?? "");

  const initials = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <form action={formAction} className="max-w-xl">
      <Card className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="size-16 rounded-full object-cover"
              onError={() => setPreview("")}
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-(--color-brand-soft) text-[22px] font-semibold text-(--color-brand)">
              {initials}
            </span>
          )}
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold leading-6">{displayName || "Ohne Namen"}</span>
            {email && <span className="text-[13px] text-(--color-fg-muted)">{email}</span>}
          </div>
        </div>

        {state.status !== "idle" && (
          <div
            role={state.status === "error" ? "alert" : "status"}
            className={`rounded-(--radius-md) border px-3 py-2.5 text-[15px] leading-6 ${
              state.status === "error"
                ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger)"
                : "border-(--color-success) bg-(--color-success-soft) text-(--color-success)"
            }`}
          >
            {state.message}
          </div>
        )}

        <input type="hidden" name="locale" value={locale} />

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">
            Anzeigename
            <span className="ml-0.5 text-(--color-brand)" aria-hidden>
              *
            </span>
          </span>
          <Input name="displayName" defaultValue={displayName} required autoComplete="name" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold leading-4">Avatar-URL</span>
          <Input
            name="avatarUrl"
            type="url"
            defaultValue={avatarUrl ?? ""}
            placeholder="https://…"
            autoComplete="off"
            onChange={(event) => setPreview(event.target.value.trim())}
          />
          <span className="text-[13px] leading-5 text-(--color-fg-muted)">
            Link zu einem Profilbild. Leer lassen, um kein Bild zu verwenden.
          </span>
        </label>

        <div className="flex justify-end">
          <Button type="submit" loading={isPending}>
            Speichern
          </Button>
        </div>
      </Card>
    </form>
  );
}
