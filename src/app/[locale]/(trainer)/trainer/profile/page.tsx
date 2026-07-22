import type { Metadata } from "next";

import { requireRole } from "@/shared/auth/guard";
import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale } from "@/shared/i18n/config";
import { ProfileScreen } from "@/features/profile/profile-screen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const messages = await getMessages(isLocale(locale) ? locale : defaultLocale);
  return { title: messages.profile.title };
}

/**
 * The trainer's profile. Body shared with `/learn/profile` and
 * `/admin/profile` — see `features/profile/profile-screen.tsx`.
 *
 * A trainer could previously not change their password or reach their
 * notification settings from here at all; both now come with the shared screen.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);
  return <ProfileScreen locale={locale} />;
}
