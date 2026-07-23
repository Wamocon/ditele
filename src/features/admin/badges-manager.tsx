"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Award } from "lucide-react";

import { Button, Card, CardTitle, Field, Input, Textarea, EmptyState } from "@/shared/ui";
import type { Badge as BadgeRow, BadgeInput } from "@/shared/data/admin";
import { createBadgeAction, updateBadgeAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

function BadgeEditor({
  locale,
  badge,
  onDone,
}: {
  locale: string;
  badge?: BadgeRow;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(badge?.name ?? "");
  const [description, setDescription] = useState(badge?.description ?? "");
  const [imageUrl, setImageUrl] = useState(badge?.image_url ?? "");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input: BadgeInput = { name, description, image_url: imageUrl };
    startTransition(async () => {
      const result = badge
        ? await updateBadgeAction(badge.id, input, locale)
        : await createBadgeAction(input, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!badge) {
        setName("");
        setDescription("");
        setImageUrl("");
      }
      onDone();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bug Hunter" />
      </Field>
      <Field label="Beschreibung">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>
      <Field label="Bild-URL">
        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      </Field>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {badge ? "Speichern" : "Badge erstellen"}
        </Button>
        {badge && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Abbrechen
          </Button>
        )}
      </div>
    </form>
  );
}

export function BadgesManager({ locale, badges }: { locale: string; badges: BadgeRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);

  function done() {
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <CardTitle>Neues Badge</CardTitle>
        <BadgeEditor locale={locale} onDone={done} />
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold leading-7">Badges</h2>
        {badges.length === 0 ? (
          <EmptyState title="Noch keine Badges" description="Erstellen Sie das erste Badge." />
        ) : (
          <ul className="flex flex-col gap-3">
            {badges.map((badge) => (
              <li key={badge.id}>
                <Card className="flex flex-col gap-3">
                  {editing === badge.id ? (
                    <BadgeEditor locale={locale} badge={badge} onDone={done} />
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {badge.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={badge.image_url}
                            alt=""
                            className="size-10 shrink-0 rounded-(--radius-md) object-cover"
                          />
                        ) : (
                          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-brand-soft) text-(--color-brand)">
                            <Award className="size-5" aria-hidden />
                          </span>
                        )}
                        <div className="flex flex-col gap-0.5">
                          <p className="font-semibold leading-5">{badge.name}</p>
                          {badge.description && (
                            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{badge.description}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Pencil className="size-4" aria-hidden />}
                        onClick={() => setEditing(badge.id)}
                      >
                        Bearbeiten
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
