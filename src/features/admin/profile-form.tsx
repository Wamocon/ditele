"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Field, Input } from "@/shared/ui";
import type { Profile, OwnProfileInput } from "@/shared/data/admin";
import { updateOwnProfileAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

export function ProfileForm({ locale, profile }: { locale: string; profile: Profile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const input: OwnProfileInput = { display_name: displayName, avatar_url: avatarUrl };
    startTransition(async () => {
      const result = await updateOwnProfileAction(input, locale);
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-(--color-brand-soft) text-[22px] font-semibold text-(--color-brand)">
            {(displayName || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="text-[13px] text-(--color-fg-muted)">Vorschau</div>
      </div>

      <Field label="Anzeigename" required>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Avatar-URL">
        <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
      </Field>

      {error && <FormMessage tone="error">{error}</FormMessage>}
      {saved && <FormMessage tone="success">Profil gespeichert.</FormMessage>}

      <div>
        <Button type="submit" loading={pending}>
          Speichern
        </Button>
      </div>
    </Card>
  );
}
