import { requireRole } from "@/shared/auth/guard";
import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale } from "@/shared/i18n/config";
import { getAdminDict } from "@/features/admin/i18n";
import { ProfileScreen } from "@/features/profile/profile-screen";

/**
 * The admin's own profile. Body shared with `/learn/profile` and
 * `/trainer/profile` — see `features/profile/profile-screen.tsx`.
 *
 * Only the breadcrumb trail is admin-specific: the admin shell puts every page
 * under "Administration /", and this one is no exception.
 *
 * Badges do not render here. An admin earns none, so the section could only
 * ever say "no badges yet" — a permanently empty panel reads as something
 * broken rather than something that does not apply.
 */
export default async function AdminProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const [messages, t] = await Promise.all([
    getMessages(isLocale(locale) ? locale : defaultLocale),
    getAdminDict(locale),
  ]);

  return (
    <ProfileScreen
      locale={locale}
      breadcrumbs={[
        { label: t.common.administration, href: `/${locale}/admin` },
        { label: messages.profile.title },
      ]}
    />
  );
}
