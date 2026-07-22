import type { ReactNode } from "react";
import { PageHeader, ThemeToggle } from "@/shared/layout";
import { Card, ErrorState } from "@/shared/ui";
import { getMyProfile } from "@/shared/data/profile";
import { listMyNotificationPreferences } from "@/shared/data/notifications";
import { getWs3Messages } from "@/features/questions/i18n";
import { initials } from "@/features/questions/format";
import { AccountForm, PasswordForm, PreferenceForm, SignOutForm } from "./profile-forms";

/**
 * `update_own_profile` rejects any timezone that is not in
 * `pg_timezone_names`, so this is a fixed shortlist of valid ones rather than a
 * free-text field. The learner's current value is added if it is not listed.
 */
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
          message={profileResult.error.message}
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
          <div className="mb-5 flex items-center gap-3">
            <span
              className="flex size-12 items-center justify-center rounded-full bg-(--color-brand-soft) text-[15px] font-semibold text-(--color-brand)"
              aria-hidden
            >
              {initials(profile.display_name)}
            </span>
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{t.avatarNotice}</p>
          </div>

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

        <Section title={t.sectionAppearance} description={t.appearanceHint}>
          {/* This toggle is outside the header, so it does not get the labels
              AppShell passes down — it has to resolve them itself, or a screen
              reader announces German here on /en and /ru. */}
          <ThemeToggle
            toLightLabel={messages.common.themeToLight}
            toDarkLabel={messages.common.themeToDark}
          />
        </Section>

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
              message={preferencesResult.error.message}
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
