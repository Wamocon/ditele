"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, ErrorState, Field, Input, Select } from "@/shared/ui";
import { updateTrainerProfileAction } from "./actions";
import { Notice } from "./notice";

/**
 * `update_own_profile` needs the row's `row_version`, so a successful save has
 * to refresh before the next one — otherwise the second save sends a stale
 * version. That is why this refreshes rather than just showing a message.
 */
export interface ProfileLabels {
  displayName: string;
  displayNameHint: string;
  locale: string;
  timezone: string;
  timezoneHint: string;
  save: string;
  saved: string;
  nameRequired: string;
}

export function ProfileForm({
  locale,
  labels,
  initial,
  localeOptions,
}: {
  locale: string;
  labels: ProfileLabels;
  initial: { displayName: string; locale: string; timezone: string; rowVersion: number };
  localeOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [profileLocale, setProfileLocale] = useState(initial.locale);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameMissing = displayName.trim().length === 0;

  return (
    <Card className="flex max-w-xl flex-col gap-4">
      {saved && <Notice message={labels.saved} className="mb-0" />}

      <Field
        label={labels.displayName}
        hint={labels.displayNameHint}
        required
        {...(touched && nameMissing ? { error: labels.nameRequired } : {})}
      >
        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          onBlur={() => setTouched(true)}
          autoComplete="name"
        />
      </Field>

      <Field label={labels.locale}>
        <Select value={profileLocale} onChange={(event) => setProfileLocale(event.target.value)}>
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={labels.timezone} hint={labels.timezoneHint}>
        <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
      </Field>

      {error && <ErrorState message={error} />}

      <Button
        type="button"
        loading={isPending}
        className="self-start"
        onClick={() => {
          setTouched(true);
          if (nameMissing) return;
          setError(null);
          setSaved(false);
          startTransition(async () => {
            const result = await updateTrainerProfileAction({
              locale,
              displayName,
              profileLocale,
              timezone,
              expectedVersion: initial.rowVersion,
            });
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            setSaved(true);
            // Pull the new row_version before another save can go stale.
            router.refresh();
          });
        }}
      >
        {labels.save}
      </Button>
    </Card>
  );
}
