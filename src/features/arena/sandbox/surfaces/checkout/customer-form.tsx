"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { useSurface } from "../../defect-context";
import type { SurfaceProps } from "../../registry-types";

/**
 * The address and contact step of the checkout scenario family.
 *
 * Effects this surface supports (registered in `surface-effects.ts`):
 *  - `email-validation-bypass` — the e-mail check stops requiring a top-level
 *    domain, so `kunde@beispiel` is accepted. In the reference scenario this
 *    is armed by a `whenInput` trigger matching exactly that shape, which is
 *    the point of that trigger type: the defect exists only for the input that
 *    exposes it, so a learner who types a normal address sees a correct form
 *    and has to think about what to try.
 */

const ContentSchema = z.object({
  heading: z.string().default("Rechnungsadresse"),
  emailLabel: z.string().default("E-Mail-Adresse"),
  firstNameLabel: z.string().default("Vorname"),
  lastNameLabel: z.string().default("Nachname"),
  streetLabel: z.string().default("Straße und Hausnummer"),
  postalCodeLabel: z.string().default("Postleitzahl"),
  cityLabel: z.string().default("Ort"),
  submitLabel: z.string().default("Zahlungspflichtig bestellen"),
  requiredHintLabel: z.string().default("Alle Felder sind Pflichtfelder."),
  emailInvalidLabel: z.string().default("Bitte geben Sie eine gültige E-Mail-Adresse ein."),
  requiredFieldLabel: z.string().default("Bitte füllen Sie dieses Feld aus."),
  successLabel: z
    .string()
    .default("Vielen Dank. Ihre Bestellung wurde entgegengenommen."),
});

/** What a correct validator requires: a dot-separated domain with a TLD. */
const STRICT_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
/** What the broken one accepts: anything with an @ in the middle. */
const LOOSE_EMAIL = /^[^\s@]+@[^\s@]+$/;

const FIELDS = ["firstName", "lastName", "street", "postalCode", "city"] as const;
type FieldName = (typeof FIELDS)[number];

export function CheckoutCustomerFormSurface({ surfaceId, content }: SurfaceProps) {
  const strings = ContentSchema.parse(content);
  const surface = useSurface(surfaceId);

  const [email, setEmail] = useState("");
  const [values, setValues] = useState<Record<FieldName, string>>({
    firstName: "",
    lastName: "",
    street: "",
    postalCode: "",
    city: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const labels: Record<FieldName, string> = {
    firstName: strings.firstNameLabel,
    lastName: strings.lastNameLabel,
    street: strings.streetLabel,
    postalCode: strings.postalCodeLabel,
    city: strings.cityLabel,
  };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // One validator, one pattern variable. The defect swaps the pattern; it
    // does not add a branch that skips validation, because a skipped branch
    // would also skip the error markup and change the layout.
    const emailPattern = surface.armed("email-validation-bypass") ? LOOSE_EMAIL : STRICT_EMAIL;
    const next: Record<string, string> = {};
    if (!emailPattern.test(email)) next.email = strings.emailInvalidLabel;
    for (const field of FIELDS) {
      if (values[field].trim() === "") next[field] = strings.requiredFieldLabel;
    }

    setErrors(next);
    setSubmitted(Object.keys(next).length === 0);
  }

  return (
    <section
      aria-labelledby={`${surfaceId}-heading`}
      className="flex flex-col gap-4 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${surfaceId}-heading`} className="text-[18px] font-semibold leading-6">
          {strings.heading}
        </h2>
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{strings.requiredHintLabel}</p>
      </div>

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
        <TextField
          id={`${surfaceId}-email`}
          label={strings.emailLabel}
          type="email"
          value={email}
          error={errors.email}
          onChange={(value) => {
            setEmail(value);
            // Publishes the value a `whenInput` trigger reads.
            surface.setInput("email", value);
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id={`${surfaceId}-firstName`}
            label={labels.firstName}
            value={values.firstName}
            error={errors.firstName}
            onChange={(value) => setValues((current) => ({ ...current, firstName: value }))}
          />
          <TextField
            id={`${surfaceId}-lastName`}
            label={labels.lastName}
            value={values.lastName}
            error={errors.lastName}
            onChange={(value) => setValues((current) => ({ ...current, lastName: value }))}
          />
        </div>

        <TextField
          id={`${surfaceId}-street`}
          label={labels.street}
          value={values.street}
          error={errors.street}
          onChange={(value) => setValues((current) => ({ ...current, street: value }))}
        />

        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <TextField
            id={`${surfaceId}-postalCode`}
            label={labels.postalCode}
            inputMode="numeric"
            value={values.postalCode}
            error={errors.postalCode}
            onChange={(value) => setValues((current) => ({ ...current, postalCode: value }))}
          />
          <TextField
            id={`${surfaceId}-city`}
            label={labels.city}
            value={values.city}
            error={errors.city}
            onChange={(value) => setValues((current) => ({ ...current, city: value }))}
          />
        </div>

        <button
          type="submit"
          className="mt-1 inline-flex h-12 min-h-12 items-center justify-center rounded-(--radius-sm) bg-(--color-ink) px-6 text-[15px] font-semibold text-(--color-bg) transition-opacity duration-(--duration-fast) hover:opacity-90"
        >
          {strings.submitLabel}
        </button>

        {submitted && (
          <p
            role="status"
            className="rounded-(--radius-sm) border border-(--color-success) bg-(--color-success-soft) px-3 py-2 text-[13px] leading-5 text-(--color-success)"
          >
            {strings.successLabel}
          </p>
        )}
      </form>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "numeric";
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold leading-5">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11 min-h-11 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg) px-3 text-[15px] text-(--color-fg)"
      />
      {/* Reserved by the flex gap only when present — the field itself never
          resizes, so an error appearing does not shift the fields below it
          past their own height. */}
      {error && (
        <p id={errorId} className="text-[13px] leading-5 text-(--color-danger)">
          {error}
        </p>
      )}
    </div>
  );
}
