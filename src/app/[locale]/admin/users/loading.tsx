"use client";

import { useParams } from "next/navigation";

import { AdminManagementLoading } from "@/features/administration/components/management-read-views";
import { adminUsersCopy } from "@/features/administration/management-read-copy";
import { isLocale } from "@/shared/i18n/config";

export default function AdminUsersLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = adminUsersCopy[locale];
  return <AdminManagementLoading description={labels.loadingDescription} title={labels.loadingTitle} />;
}
