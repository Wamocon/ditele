import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { requireRole } from "@/shared/auth/guard";
import { createServerClient } from "@/shared/database/server";
import { ProfileForm } from "@/features/review/profile-form";

export const metadata: Metadata = { title: "Profil" };

/** The trainer's own profile — display name and avatar. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { principal } = await requireRole(["trainer", "admin"], locale);

  const supabase = await createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", principal.userId)
    .maybeSingle();

  return (
    <>
      <PageHeader
        title="Profil"
        description="Verwalten Sie Ihren Anzeigenamen und Ihr Profilbild."
      />
      <ProfileForm
        locale={locale}
        email={principal.email}
        displayName={profile?.display_name ?? principal.displayName}
        avatarUrl={profile?.avatar_url ?? null}
      />
    </>
  );
}
