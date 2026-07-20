import { notFound } from "next/navigation";
import { z } from "zod";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { adminMemberDetailCopy } from "@/features/administration/admin-member-detail-copy";
import { readAdminMemberDetail } from "@/features/administration/admin-member-detail-data";
import { AdminMemberDetailView } from "@/features/administration/components/admin-member-detail";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

const userIdSchema = z.string().uuid();

export default async function AdminMemberDetailPage({
  params,
}: {
  readonly params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  if (!isLocale(locale) || !userIdSchema.safeParse(userId).success) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/admin/users/${userId}`,
      ["admin", "content_admin"],
    ))
  ) {
    return null;
  }

  const labels = adminMemberDetailCopy[locale];
  const principal = await getPrincipal();
  if (!principal.organizationId || !hasPermission(principal, "organization.manage")) {
    return (
      <StatePanel
        description={labels.forbiddenDescription}
        title={labels.forbiddenTitle}
        tone="danger"
      />
    );
  }

  const detail = await readAdminMemberDetail(principal, locale, userId);
  if (!detail) notFound();
  return <AdminMemberDetailView detail={detail} labels={labels} locale={locale} />;
}
