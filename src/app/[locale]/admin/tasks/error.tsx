"use client";

import { useParams } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { StatePanel } from "@/shared/ui/state-panel";

import { adminTasksCopy } from "./copy";

export default function AdminTasksError({ reset }: { readonly reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = adminTasksCopy[locale];
  return (
    <StatePanel
      action={<Button onClick={reset}>{labels.retry}</Button>}
      description={labels.errorDescription}
      title={labels.errorTitle}
      tone="danger"
    />
  );
}
