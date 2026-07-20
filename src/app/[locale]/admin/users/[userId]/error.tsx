"use client";

import { useParams } from "next/navigation";

import { adminMemberDetailCopy } from "@/features/administration/admin-member-detail-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function AdminMemberDetailError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = adminMemberDetailCopy[locale];
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
