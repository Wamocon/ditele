import { requireRole } from "@/shared/auth/guard";
import { ProfileScreen } from "@/features/profile/profile-screen";

/**
 * The learner's profile. Body shared with `/trainer/profile` and
 * `/admin/profile` — see `features/profile/profile-screen.tsx` for why the
 * three stopped being separate screens.
 */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["student", "trainer", "admin"], locale);
  return <ProfileScreen locale={locale} />;
}
