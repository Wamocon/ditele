"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, CardTitle, CardDescription, Field, Select, Badge } from "@/shared/ui";
import type { Profile, UserRole } from "@/shared/data/admin";
import { updateUserRoleAction, setUserActiveAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

export function UserEditForm({ locale, profile }: { locale: string; profile: Profile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [role, setRole] = useState<UserRole>(profile.role);

  function saveRole(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateUserRoleAction(profile.id, role, locale);
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function toggleActive() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setUserActiveAction(profile.id, !profile.is_active, locale);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card as="form" onSubmit={saveRole} className="flex flex-col gap-4">
        <CardTitle>Rolle</CardTitle>
        <Field label="Rolle">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="student">Teilnehmer</option>
            <option value="trainer">Trainer</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {saved && <FormMessage tone="success">Rolle gespeichert.</FormMessage>}
        <div>
          <Button type="submit" loading={pending} disabled={role === profile.role}>
            Rolle speichern
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Konto-Status</CardTitle>
            <CardDescription>
              Ein inaktives Konto kann sich nicht anmelden.
            </CardDescription>
          </div>
          <Badge tone={profile.is_active ? "success" : "neutral"} dot>
            {profile.is_active ? "Aktiv" : "Inaktiv"}
          </Badge>
        </div>
        <div>
          <Button
            variant={profile.is_active ? "danger" : "primary"}
            onClick={toggleActive}
            loading={pending}
          >
            {profile.is_active ? "Deaktivieren" : "Aktivieren"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
