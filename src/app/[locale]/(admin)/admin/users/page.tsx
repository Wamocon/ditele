import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Select,
  type Column,
} from "@/shared/ui";
import { listAdminUsers, listRoles, type AdminUser } from "@/shared/data/admin";
import { formatDateTime } from "@/features/admin/format";
import { fill, getAdminDict, roleLabel, type AdminDict } from "@/features/admin/i18n";
import { toUiRole } from "@/shared/auth/role";
import type { AppRole } from "@/shared/auth/types";
import { FilterField, FilterForm, Pagination } from "@/features/admin/ui";

const PAGE_SIZE = 25;

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getAdminDict(locale);

  const search = typeof query.q === "string" ? query.q : undefined;
  const roleCode = typeof query.role === "string" && query.role !== "" ? query.role : undefined;
  const offset = Number.parseInt(typeof query.offset === "string" ? query.offset : "0", 10) || 0;
  const basePath = `/${locale}/admin/users`;

  const [usersResult, rolesResult] = await Promise.all([
    listAdminUsers({
      ...(search ? { search } : {}),
      ...(roleCode ? { roleCode } : {}),
      limit: PAGE_SIZE,
      offset,
    }),
    listRoles(),
  ]);

  if (!usersResult.ok) {
    return (
      <>
        <PageHeader title={t.users.title} description={t.users.description} />
        <ErrorState message={usersResult.error.message} />
      </>
    );
  }

  const { rows, total, truncated } = usersResult.data;
  const roles = rolesResult.ok ? rolesResult.data : [];
  const columns = userColumns(locale, t);

  return (
    <>
      <PageHeader
        title={t.users.title}
        description={t.users.description}
        breadcrumbs={[
          { label: t.common.administration, href: `/${locale}/admin` },
          { label: t.users.title },
        ]}
        actions={
          <Link
            href={`${basePath}/new` as Route}
            className="inline-flex h-11 min-h-11 items-center rounded-(--radius-md) bg-(--color-brand) px-4 text-[15px] font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-hover)"
          >
            {t.users.create}
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <FilterForm
            action={basePath}
            submitLabel={t.common.apply}
            resetHref={basePath as Route}
            resetLabel={t.common.reset}
          >
            <FilterField label={t.common.search} htmlFor="q">
              <Input
                id="q"
                name="q"
                type="search"
                defaultValue={search ?? ""}
                placeholder={t.common.searchPlaceholder}
              />
            </FilterField>
            <FilterField label={t.common.filterRole} htmlFor="role">
              <Select id="role" name="role" defaultValue={roleCode ?? ""}>
                <option value="">{t.common.filterAll}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.code}>
                    {roleLabel(t, r.code)}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterForm>
        </Card>

        <Card>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.userId}
            caption={t.users.title}
            emptyState={
              <EmptyState title={t.users.emptyTitle} description={t.users.emptyDescription} />
            }
          />

          {truncated && (
            <p className="pt-3 text-[13px] leading-5 text-(--color-fg-muted)">
              {t.users.truncated}
            </p>
          )}

          <Pagination
            basePath={basePath}
            params={{
              ...(search ? { q: search } : {}),
              ...(roleCode ? { role: roleCode } : {}),
            }}
            total={total}
            limit={PAGE_SIZE}
            offset={offset}
            labels={{
              showing: fill(t.common.showing, {
                from: total === 0 ? 0 : offset + 1,
                to: Math.min(offset + PAGE_SIZE, total),
                total,
              }),
              previous: t.common.previous,
              next: t.common.next,
            }}
          />
        </Card>
      </div>
    </>
  );
}

/**
 * The name cell is a real `<Link>` rather than DataTable's `onRowClick` — a
 * function prop cannot cross into a Server Component, and an anchor is
 * keyboard-navigable and middle-clickable, which a row handler is not.
 */
function userColumns(locale: string, t: AdminDict): Column<AdminUser>[] {
  return [
    {
      key: "name",
      header: t.users.colName,
      cell: (row) => (
        <Link
          href={`/${locale}/admin/users/${row.userId}` as Route}
          className="font-semibold text-(--color-brand) hover:underline"
        >
          {row.displayName}
        </Link>
      ),
    },
    {
      key: "email",
      header: t.users.colEmail,
      cell: (row) => (
        <span className="break-all text-(--color-fg-muted)">{row.email ?? t.common.none}</span>
      ),
    },
    {
      key: "role",
      header: t.users.colRole,
      cell: (row) => (
        <Badge tone={roleTone(row.roleCode)}>{roleLabel(t, uiRoleCode(row.roleCode))}</Badge>
      ),
    },
    {
      key: "state",
      header: t.users.colState,
      cell: (row) =>
        row.bannedUntil ? (
          <Badge tone="danger" dot>
            {t.users.stateDeactivated}
          </Badge>
        ) : (
          <Badge tone="success" dot>
            {t.users.stateActive}
          </Badge>
        ),
    },
    {
      key: "lastLogin",
      header: t.users.colLastLogin,
      numeric: true,
      cell: (row) => formatDateTime(row.lastSignInAt, locale) ?? t.common.never,
    },
  ];
}

/**
 * ⭐ Collapse a database role onto the one the interface speaks.
 *
 * The list used to print the raw code, so Olivia read as "ORGANISATION
 * ADMINISTRATION" while every guard, every redirect and her own dashboard
 * treated her as an administrator. `shared/auth/role.ts` has always mapped the
 * eight database roles onto three; this screen was showing the other seven.
 *
 * Returned as a DATABASE code rather than a `UiRole` so `roleLabel` keeps
 * working unchanged — `roleLabels` is keyed by code, and `student` is not one
 * of them.
 */
function uiRoleCode(code: string | null): string | null {
  if (!code) return code;
  switch (toUiRole([code as AppRole])) {
    case "admin":
      return "admin";
    case "trainer":
      return "trainer";
    default:
      return "learner";
  }
}

function roleTone(code: string | null): "brand" | "info" | "neutral" {
  const mapped = uiRoleCode(code);
  if (mapped === "admin") return "brand";
  if (mapped === "trainer") return "info";
  return "neutral";
}
