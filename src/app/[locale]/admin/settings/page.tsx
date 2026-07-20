import { notFound } from "next/navigation";

import { canRenderProtectedPage, getPrincipal } from "@/app/[locale]/_data/principal";
import { AdminSettingsView } from "@/features/administration/components/management-read-views";
import { adminSettingsCopy } from "@/features/administration/management-read-copy";
import { readAdminOrganizationSettings } from "@/features/administration/management-read-data";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default async function AdminSettingsPage({ params }: { readonly params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await canRenderProtectedPage(locale, `/${locale}/admin/settings`, ["admin", "content_admin"]))) {
    return null;
  }
  const labels = adminSettingsCopy[locale];
  const principal = await getPrincipal();
  if (!principal.organizationId || !hasPermission(principal, "organization.manage")) {
    return <StatePanel description={labels.forbiddenDescription} title={labels.forbiddenTitle} tone="danger" />;
  }
  const result = await readAdminOrganizationSettings(principal, locale);
  return <AdminSettingsView {...result} labels={labels} locale={locale} />;
}
