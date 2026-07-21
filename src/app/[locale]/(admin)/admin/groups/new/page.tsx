import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { getAdminDict } from "@/features/admin/i18n";
import { BlockedNotice } from "@/features/admin/ui";

/**
 * ⛔ Blocked by the database, not by this workstream — see ISSUES I-011.
 *
 * `insert into cohorts` is refused for an authenticated admin with
 * `42501 permission denied for table cohorts` (no DML grant at all), and none of
 * the 48 RPCs creates a cohort — `transition_cohort` only moves an existing one.
 * A migration is needed.
 *
 * This renders the reason instead of a form, deliberately. A form here would
 * collect four fields, submit, and fail with a permission error the admin can do
 * nothing about — which reads as a broken app rather than a missing capability.
 */
export default async function NewGroupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getAdminDict(locale);

  return (
    <>
      <PageHeader
        title={t.groupNew.title}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.groups.title, href: `/${locale}/admin/groups` },
          { label: t.groupNew.title },
        ]}
      />

      <BlockedNotice
        title={t.groupNew.blockedTitle}
        body={t.groupNew.blockedBody}
        workaround={t.groupNew.blockedWorkaround}
        ticket={t.groupNew.blockedTicket}
        action={
          <Link
            href={`/${locale}/admin/groups` as Route}
            className="inline-flex h-11 min-h-11 items-center rounded-[--radius-md] border border-[--color-border-strong] bg-[--color-bg] px-4 text-[15px] font-semibold hover:bg-[--color-surface]"
          >
            {t.groupNew.backToGroups}
          </Link>
        }
      />
    </>
  );
}
