"use client";

import { useParams } from "next/navigation";

import { AdminManagementLoading } from "@/features/administration/components/management-read-views";
import { adminSettingsCopy } from "@/features/administration/management-read-copy";
import { isLocale } from "@/shared/i18n/config";

export default function AdminSettingsLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = adminSettingsCopy[locale];
  return <AdminManagementLoading description={labels.loadingDescription} title={labels.loadingTitle} />;
}
