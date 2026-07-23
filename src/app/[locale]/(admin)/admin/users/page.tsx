import type { Route } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, Badge, EmptyState, ErrorState, DataTable, type Column } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listProfiles, type Profile } from "@/shared/data/admin";
import { UI_ROLE_LABEL } from "@/shared/auth/role";

const ROLE_TONE = { admin: "brand", trainer: "info", student: "neutral" } as const;

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const result = await listProfiles();

  const header = (
    <PageHeader
      title="Benutzer"
      description="Alle Konten mit Rolle und Status."
      actions={
        <Link href={`/${locale}/admin/users/new` as Route}>
          <Button iconLeft={<UserPlus className="size-4" aria-hidden />}>Benutzer erstellen</Button>
        </Link>
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const columns: Column<Profile>[] = [
    {
      key: "name",
      header: "Name",
      cell: (p) => (
        <Link
          href={`/${locale}/admin/users/${p.id}` as Route}
          className="font-medium text-(--color-brand) hover:underline"
        >
          {p.display_name || "—"}
        </Link>
      ),
    },
    {
      key: "role",
      header: "Rolle",
      cell: (p) => <Badge tone={ROLE_TONE[p.role]}>{UI_ROLE_LABEL[p.role]}</Badge>,
    },
    {
      key: "state",
      header: "Status",
      cell: (p) =>
        p.is_active ? (
          <Badge tone="success" dot>
            Aktiv
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Inaktiv
          </Badge>
        ),
    },
  ];

  return (
    <>
      {header}

      {result.data.length === 0 ? (
        <EmptyState
          title="Noch keine Benutzer"
          action={
            <Link href={`/${locale}/admin/users/new` as Route}>
              <Button>Benutzer erstellen</Button>
            </Link>
          }
        />
      ) : (
        <DataTable columns={columns} rows={result.data} rowKey={(p) => p.id} caption="Benutzer" />
      )}
    </>
  );
}
