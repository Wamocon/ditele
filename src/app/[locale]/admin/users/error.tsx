"use client";

import { useParams } from "next/navigation";

import { adminUsersCopy } from "@/features/administration/management-read-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function AdminUsersError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = adminUsersCopy[locale];
  return <StatePanel action={<button className="button" onClick={reset} type="button">{labels.retry}</button>} description={labels.errorDescription} title={labels.errorTitle} tone="danger" />;
}
