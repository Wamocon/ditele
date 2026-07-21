import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Badge, EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { getAdminUser, listRoles } from "@/shared/data/admin";
import { getPrincipal } from "@/shared/data/session";
import { formatDateTime } from "@/features/admin/format";
import { getAdminDict, roleLabel } from "@/features/admin/i18n";
import { DefinitionList, Section } from "@/features/admin/ui";
import { AccessPanel, PasswordPanel, RolePanel } from "@/features/admin/user-panels";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  const t = await getAdminDict(locale);

  const [userResult, rolesResult, session] = await Promise.all([
    getAdminUser(userId),
    listRoles(),
    getPrincipal(),
  ]);

  if (!userResult.ok) {
    return (
      <>
        <PageHeader
          title={t.userDetail.title}
          breadcrumbs={[
            { label: t.common.administration, href: `/${locale}/admin` },
            { label: t.users.title, href: `/${locale}/admin/users` },
            { label: t.userDetail.title },
          ]}
        />
        {userResult.error.code === "PGRST116" ? (
          <EmptyState
            title={t.userDetail.notFound}
            action={
              <Link
                href={`/${locale}/admin/users` as Route}
                className="text-(--color-brand) underline underline-offset-4"
              >
                {t.userDetail.backToUsers}
              </Link>
            }
          />
        ) : (
          <ErrorState message={userResult.error.message} />
        )}
      </>
    );
  }

  const { user, enrollments, cohorts } = userResult.data;
  const roles = rolesResult.ok ? rolesResult.data : [];
  const currentRoleId = roles.find((r) => r.code === user.roleCode)?.id ?? null;
  const isSelf = session?.principal.userId === user.userId;

  return (
    <>
      <PageHeader
        title={user.displayName}
        {...(user.email ? { description: user.email } : {})}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.users.title, href: `/${locale}/admin/users` },
          { label: user.displayName },
        ]}
        actions={
          user.bannedUntil ? (
            <Badge tone="danger" dot>
              {t.users.stateDeactivated}
            </Badge>
          ) : (
            <Badge tone="success" dot>
              {t.users.stateActive}
            </Badge>
          )
        }
      />

      <div className="flex flex-col gap-4">
        <Section title={t.userDetail.profile} description={t.userDetail.profileReadOnly}>
          <DefinitionList
            items={[
              { label: t.userDetail.email, value: user.email ?? t.common.none },
              { label: t.userDetail.locale, value: user.locale },
              { label: t.userDetail.timezone, value: user.timezone },
              {
                label: t.userDetail.created,
                value: formatDateTime(user.createdAt, locale) ?? t.common.none,
              },
              {
                label: t.userDetail.lastLogin,
                value: formatDateTime(user.lastSignInAt, locale) ?? t.common.never,
              },
              { label: t.userDetail.roleCurrent, value: roleLabel(t, user.roleCode) },
            ]}
          />
        </Section>

        <Section title={t.userDetail.roleSection}>
          <RolePanel userId={user.userId} currentRoleId={currentRoleId} roles={roles} t={t} />
        </Section>

        <Section title={t.userDetail.accessSection}>
          <AccessPanel
            userId={user.userId}
            isDeactivated={Boolean(user.bannedUntil)}
            isSelf={isSelf}
            t={t}
          />
        </Section>

        <Section title={t.userDetail.passwordSection}>
          <PasswordPanel userId={user.userId} t={t} />
        </Section>

        <Section title={t.userDetail.enrollments}>
          {enrollments.length === 0 ? (
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">
              {t.userDetail.noEnrollments}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-(--color-border)">
              {enrollments.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold leading-6">{e.courseTitle}</span>
                    <span className="text-[13px] leading-5 text-(--color-fg-muted)">
                      {e.cohortName ?? t.common.none}
                    </span>
                  </div>
                  <StatusBadge state={e.state} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t.userDetail.cohorts}>
          {cohorts.length === 0 ? (
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">
              {t.userDetail.noCohorts}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-(--color-border)">
              {cohorts.map((c) => (
                <li key={c.cohortId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="text-[15px] font-semibold leading-6">
                    {c.cohortName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge tone={c.role === "trainer" ? "info" : "neutral"}>
                      {c.role === "trainer" ? t.groupDetail.roleTrainer : t.groupDetail.roleLearner}
                    </Badge>
                    <StatusBadge state={c.state} locale={locale} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
