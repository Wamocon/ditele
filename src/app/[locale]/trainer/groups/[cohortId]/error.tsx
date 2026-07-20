"use client";

import { useParams } from "next/navigation";

import { cohortManagementCopy } from "@/features/cohorts/cohort-management-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function TrainerGroupDetailError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = cohortManagementCopy[locale];
  return (
    <StatePanel
      action={
        <button className="button" onClick={reset} type="button">
          {labels.retry}
        </button>
      }
      description={labels.errorDescription}
      title={labels.errorTitle}
      tone="danger"
    />
  );
}
