import type { ReactNode } from "react";
import { PageHeader } from "@/shared/layout";
import { Card, ErrorState } from "@/shared/ui";
import { getMyProfile } from "@/shared/data/profile";
import { listMyNotificationPreferences } from "@/shared/data/notifications";
import { getWs3Messages } from "@/features/questions/i18n";
import { AvatarUpload } from "@/features/admin/avatar-upload";
import { AccountForm, PasswordForm, PreferenceForm, SignOutForm } from "./profile-forms";

/**
 * `update_own_profile` rejects any timezone that is not in
 * `pg_timezone_names`, so this is a fixed shortlist of valid ones rather than a
 * free-text field. The learner's current value is added if it is not listed.
 */
/**
 * The avatars bucket is PUBLIC, so the URL is derivable and needs no round
 * trip. Same derivation as the admin profile — kept identical on purpose, so
 * the two screens cannot drift into showing different images for one key.
 */
function avatarUrl(objectKey: string | null): string | null {
  if (!objectKey) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/avatars/${objectKey}` : null;
}

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Moscow",
  "UTC",
];

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.profile;

  const [profileResult, preferencesResult] = await Promise.all([
    getMyProfile(),
    listMyNotificationPreferences(),
  ]);

  if (!profileResult.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <ErrorState
          title={messages.learn.shared.loadErrorTitle}
          error={profileResult.error}
          locale={locale}
        />
      </>
    );
  }

  const profile = profileResult.data;
  const timezones = TIMEZONES.includes(profile.timezone)
    ? TIMEZONES
    : [profile.timezone, ...TIMEZONES];
  const familyLabels: Record<string, string> = t.families;

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <div className="flex flex-col gap-6">
        <Section title={t.sectionAccount}>
          {/* A learner used to see "Profile pictures are not available yet"
              beside their initials. They were available: the public `avatars`
              bucket, `profiles.avatar_object_key` and this very component all
              shipped, and the ADMIN profile has been using them. Only the
              learner and trainer screens were left with the placeholder. */}
          <AvatarUpload
            userId={profile.user_id}
            displayName={profile.display_name}
            publicUrl={avatarUrl(profile.avatar_object_key)}
            strings={{
              change: t.photoChange,
              remove: t.photoRemove,
              hint: t.photoHint,
              tooLarge: t.photoTooLarge,
              wrongType: t.photoWrongType,
              failed: t.photoFailed,
            }}
          />

          <AccountForm
            locale={locale}
            timezones={timezones}
            defaults={{
              displayName: profile.display_name,
              email: profile.email ?? "",
              profileLocale: profile.locale,
              timezone: profile.timezone,
              version: profile.row_version,
            }}
            labels={{
              displayName: t.displayName,
              email: t.email,
              emailHint: t.emailHint,
              language: t.language,
              languageHint: t.languageHint,
              timezone: t.timezone,
              timezoneHint: t.timezoneHint,
              save: t.save,
              languages: t.languages,
            }}
          />
        </Section>

        {/* The "Appearance" section is gone. The theme toggle lives in the app
            header on every screen, so this was a second control for the same
            device-local setting — and the one in the header is the one people
            actually use, because it is where they already are. Nothing was lost
            with the section; only the duplicate. */}

        <Section title={t.sectionNotifications} description={t.notificationsHint}>
          {preferencesResult.ok ? (
            <div className="flex flex-col">
              {preferencesResult.data.map((preference) => (
                <PreferenceForm
                  key={preference.family}
                  locale={locale}
                  preference={preference}
                  familyLabel={familyLabels[preference.family] ?? preference.family}
                  labels={{
                    inApp: t.channelInApp,
                    email: t.channelEmail,
                    push: t.channelPush,
                    save: t.save,
                  }}
                />
              ))}
            </div>
          ) : (
            <ErrorState
              title={messages.learn.shared.loadErrorTitle}
              error={preferencesResult.error}
              locale={locale}
            />
          )}
        </Section>

        <Section title={t.sectionPassword}>
          <PasswordForm
            locale={locale}
            labels={{
              newPassword: t.newPassword,
              newPasswordRepeat: t.newPasswordRepeat,
              hint: t.passwordHint,
              submit: t.changePassword,
            }}
          />
        </Section>

        <Section title={t.sectionSession} description={t.sessionHint}>
          <SignOutForm locale={locale} label={t.signOut} />
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card as="section">
      <h2 className="text-[22px] font-semibold leading-7">{title}</h2>
      {description && (
        <p className="mt-1 max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">
          {description}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
