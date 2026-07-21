import { Award } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Badge, EmptyState, ErrorState } from "@/shared/ui";
import { getOwnProfile } from "@/shared/data/admin";
import { getPrincipal } from "@/shared/data/session";
import { getAdminDict, roleLabel } from "@/features/admin/i18n";
import { formatDateTime } from "@/features/admin/format";
import { ProfileForm } from "@/features/admin/profile-form";
import { AvatarUpload } from "@/features/admin/avatar-upload";
import { DefinitionList, Section } from "@/features/admin/ui";

/** The avatars bucket is public, so the URL is derivable with no round trip. */
function avatarUrl(objectKey: string | null): string | null {
  if (!objectKey) return null;
  const base = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  return base ? `${base}/storage/v1/object/public/avatars/${objectKey}` : null;
}

export default async function AdminProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getAdminDict(locale);

  const session = await getPrincipal();
  if (!session) {
    return (
      <>
        <PageHeader title={t.profile.title} description={t.profile.description} />
        <ErrorState message={t.common.saveFailed} />
      </>
    );
  }

  const result = await getOwnProfile(session.principal.userId);
  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.profile.title} description={t.profile.description} />
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const profile = result.data;

  return (
    <>
      <PageHeader
        title={t.profile.title}
        description={t.profile.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.profile.title },
        ]}
      />

      <div className="flex flex-col gap-4">
        {/* ── Identity: photo and the one editable field ─────────────────── */}
        <Section title={t.profile.identity}>
          <AvatarUpload
            userId={profile.userId}
            displayName={profile.displayName}
            publicUrl={avatarUrl(profile.avatarObjectKey)}
            strings={{
              change: t.profile.photoChange,
              remove: t.profile.photoRemove,
              hint: t.profile.photoHint,
              tooLarge: t.profile.photoTooLarge,
              wrongType: t.profile.photoWrongType,
              failed: t.profile.photoFailed,
            }}
          />

          <ProfileForm
            displayName={profile.displayName}
            locale={profile.locale}
            timezone={profile.timezone}
            expectedVersion={profile.rowVersion}
            t={t}
          />
        </Section>

        {/* ── Account facts — read-only on purpose ───────────────────────── */}
        <Section title={t.profile.accountSection}>
          <DefinitionList
            items={[
              { label: t.profile.email, value: profile.email ?? t.common.none },
              { label: t.profile.role, value: roleLabel(t, profile.roleCode) },
              { label: t.profile.memberSince, value: formatDateTime(profile.createdAt, locale) ?? t.common.none },
              {
                label: t.profile.lastSeen,
                value: profile.lastSeenAt
                  ? (formatDateTime(profile.lastSeenAt, locale) ?? t.common.never)
                  : t.common.never,
              },
              {
                // Not editable: every timestamp in the product renders in the
                // browser's own zone, so a second value typed here could only
                // ever disagree with what the user actually sees.
                label: t.profile.timezone,
                value: profile.timezone,
              },
            ]}
          />
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">{t.profile.emailHint}</p>
        </Section>

        {/* ── Badges ─────────────────────────────────────────────────────── */}
        <Section title={t.profile.badges}>
          {profile.badges.length === 0 ? (
            <EmptyState
              icon={<Award className="size-6" aria-hidden />}
              title={t.profile.badgesEmptyTitle}
              description={t.profile.badgesEmptyBody}
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {profile.badges.map((badge) => (
                <li key={badge.id}>
                  <Badge tone="brand" dot>
                    {badge.label}
                    <span className="ml-1.5 text-(--color-fg-muted)">
                      {formatDateTime(badge.awardedAt, locale) ?? ""}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
