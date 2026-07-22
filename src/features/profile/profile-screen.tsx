import type { ReactNode } from "react";
import { Award } from "lucide-react";

import { PageHeader, type Breadcrumb } from "@/shared/layout";
import { Badge, Card, EmptyState, ErrorState } from "@/shared/ui";
import { listMyNotificationPreferences } from "@/shared/data/notifications";
import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale } from "@/shared/i18n/config";
import { formatDateTime } from "@/shared/format";
import { AvatarUpload } from "@/features/admin/avatar-upload";

import { getMyFullProfile } from "./data";
import { profileStrings } from "./strings";
import { AccountForm, PasswordForm, PreferenceForm, SignOutForm } from "./forms";

/**
 * ONE profile screen, rendered by all three role routes.
 *
 * The three used to be separate pages that had drifted into three different
 * products for one account:
 *
 *   learner   photo · name · email · language · time zone · notifications ·
 *             password · sign out
 *   trainer   photo · name · language · time zone · email · role
 *   admin     photo · name (only) · email · role · member since · last active ·
 *             time zone (read-only) · badges
 *
 * So a trainer could not change their password from their own profile, nobody
 * but the admin could see when they joined, and the learner was the only one
 * who could reach their notification settings. None of those were decisions
 * about what a role should be able to do; they were three chats building the
 * same screen from different halves of the same table.
 *
 * What is role-dependent, on purpose:
 *   badges  — a learner reward. A trainer or admin earns none, and an empty
 *             "no badges yet" panel on their screen is a promise the product
 *             does not keep.
 *   voice   — German "du" for learners, "Sie" for staff. See ./strings.ts.
 *
 * Everything else is identical for everyone, because the account is.
 *
 * The language picker is gone from all three. It sat in the header as well, so
 * there were two controls for one value and the winner was whichever you
 * touched last — and only one of them needed a Save.
 */

/**
 * `update_own_profile` rejects any zone that is not in `pg_timezone_names`, so
 * this is a fixed shortlist rather than a free-text box. The stored value is
 * added if it is not listed, so an existing setting is never silently changed
 * by opening the form.
 */
const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Moscow",
  "UTC",
];

/**
 * The avatars bucket is PUBLIC, so the URL is derivable and needs no round
 * trip. One derivation for all three screens — they cannot show different
 * images for one key.
 */
function avatarUrl(objectKey: string | null): string | null {
  if (!objectKey) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/avatars/${objectKey}` : null;
}

export async function ProfileScreen({
  locale,
  breadcrumbs,
}: {
  locale: string;
  /** The admin shell renders a breadcrumb trail; the other two do not. */
  breadcrumbs?: Breadcrumb[];
}) {
  const messages = await getMessages(isLocale(locale) ? locale : defaultLocale);
  const [profileResult, preferencesResult] = await Promise.all([
    getMyFullProfile(locale),
    listMyNotificationPreferences(),
  ]);

  // The role decides the voice, so the strings cannot be resolved before the
  // profile is read. A failed read falls back to the formal copy.
  const t = profileStrings(messages.profile, profileResult.ok ? profileResult.data.role : "trainer");
  const crumbs = breadcrumbs ? { breadcrumbs } : {};

  if (!profileResult.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} {...crumbs} />
        <ErrorState title={t.loadError} error={profileResult.error} locale={locale} />
      </>
    );
  }

  const profile = profileResult.data;
  const timezones = TIMEZONES.includes(profile.timezone)
    ? TIMEZONES
    : [profile.timezone, ...TIMEZONES];
  const roleLabels = messages.roles as Record<string, string>;
  const familyLabels: Record<string, string> = t.families;

  return (
    <>
      <PageHeader title={t.title} description={t.description} {...crumbs} />

      <div className="flex flex-col gap-6">
        {/* ── Identity ──────────────────────────────────────────────────── */}
        <Section title={t.sectionIdentity}>
          <div className="flex flex-col gap-6">
            <AvatarUpload
              userId={profile.userId}
              displayName={profile.displayName}
              publicUrl={avatarUrl(profile.avatarObjectKey)}
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
              strings={t}
              timezones={timezones}
              defaults={{
                displayName: profile.displayName,
                profileLocale: profile.locale,
                timezone: profile.timezone,
                version: profile.rowVersion,
              }}
            />
          </div>
        </Section>

        {/* ── Account facts — read-only on purpose ──────────────────────── */}
        <Section title={t.sectionAccount} description={t.emailHint}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <Fact label={t.email} value={profile.email ?? "—"} />
            <Fact label={t.role} value={roleLabels[profile.role] ?? profile.role} />
            <Fact
              label={t.memberSince}
              // Rendered in the zone the account is set to, which is the whole
              // point of the field above. Every other date in the product still
              // renders in the server's zone — tracked separately; this screen
              // is the one place the setting is visible next to its effect.
              value={formatDateTime(profile.createdAt, locale, { timeZone: profile.timezone })}
            />
            <Fact
              label={t.lastActive}
              value={
                profile.lastSeenAt
                  ? formatDateTime(profile.lastSeenAt, locale, { timeZone: profile.timezone })
                  : t.never
              }
            />
          </dl>
        </Section>

        {/* ── Badges — learners only ────────────────────────────────────── */}
        {profile.role === "student" && (
          <Section title={t.sectionBadges}>
            {profile.badges.length === 0 ? (
              <EmptyState
                icon={<Award className="size-6" aria-hidden />}
                title={t.badgesEmptyTitle}
                description={t.badgesEmptyBody}
              />
            ) : (
              <ul className="flex list-none flex-wrap gap-2 p-0">
                {profile.badges.map((badge) => (
                  <li key={badge.id}>
                    <Badge tone="brand" dot>
                      {badge.label}
                      <span className="ml-1.5 text-(--color-fg-muted)">
                        {formatDateTime(badge.awardedAt, locale, {
                          timeZone: profile.timezone,
                          fallback: "",
                        })}
                      </span>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* ── Notifications ─────────────────────────────────────────────── */}
        <Section title={t.sectionNotifications} description={t.notificationsHint}>
          {preferencesResult.ok ? (
            <div className="flex flex-col">
              {preferencesResult.data.map((preference) => (
                <PreferenceForm
                  key={preference.family}
                  locale={locale}
                  preference={preference}
                  familyLabel={familyLabels[preference.family] ?? preference.family}
                  strings={t}
                />
              ))}
            </div>
          ) : (
            <ErrorState title={t.loadError} error={preferencesResult.error} locale={locale} />
          )}
        </Section>

        {/* ── Password ──────────────────────────────────────────────────── */}
        <Section title={t.sectionPassword}>
          <PasswordForm locale={locale} strings={t} />
        </Section>

        {/* ── Session ───────────────────────────────────────────────────── */}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] leading-4 text-(--color-fg-muted)">{label}</dt>
      <dd className="text-[15px] leading-6 font-semibold">{value}</dd>
    </div>
  );
}
