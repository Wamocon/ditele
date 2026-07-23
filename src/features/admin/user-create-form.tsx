"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Button, Card, Field, Input, Select } from "@/shared/ui";
import type { CreateUserInput, UserRole } from "@/shared/data/admin";
import { createUserAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

export function UserCreateForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("student");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input: CreateUserInput = { email, name, role };
    startTransition(async () => {
      const result = await createUserAction(input, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/${locale}/admin/users` as Route);
      router.refresh();
    });
  }

  return (
    <Card as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="E-Mail" required>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
      </Field>
      <Field label="Anzeigename" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" />
      </Field>
      <Field label="Rolle" required>
        <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          <option value="student">Teilnehmer</option>
          <option value="trainer">Trainer</option>
          <option value="admin">Administrator</option>
        </Select>
      </Field>

      <p className="rounded-(--radius-md) bg-(--color-surface-2) px-3 py-2 text-[13px] leading-5 text-(--color-fg-muted)">
        Das Startpasswort ist <span className="font-semibold text-(--color-fg)">123123123</span>. Die E-Mail-Adresse
        wird sofort bestätigt, sodass sich die Person direkt anmelden kann.
      </p>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div>
        <Button type="submit" loading={pending}>
          Benutzer erstellen
        </Button>
      </div>
    </Card>
  );
}
