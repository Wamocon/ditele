import type { Route } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, EmptyState, ErrorState, StatusBadge, DataTable, type Column } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listCourses, type Course } from "@/shared/data/admin";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const result = await listCourses();

  const header = (
    <PageHeader
      title="Kurse"
      description="Alle Kurse mit ihrem Status."
      actions={
        <Link href={`/${locale}/admin/courses/new` as Route}>
          <Button iconLeft={<Plus className="size-4" aria-hidden />}>Kurs erstellen</Button>
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

  const courses = result.data;

  const columns: Column<Course>[] = [
    {
      key: "title",
      header: "Titel",
      cell: (c) => (
        <Link
          href={`/${locale}/admin/courses/${c.id}` as Route}
          className="font-medium text-(--color-brand) hover:underline"
        >
          {c.title}
        </Link>
      ),
    },
    {
      key: "slug",
      header: "Slug",
      cell: (c) => <span className="text-(--color-fg-muted)">{c.slug}</span>,
    },
    {
      key: "state",
      header: "Status",
      cell: (c) => <StatusBadge state={c.state} locale={locale} />,
    },
    {
      key: "people",
      header: "Personen",
      cell: (c) => (
        <Link
          href={`/${locale}/admin/courses/${c.id}/people` as Route}
          className="text-[13px] text-(--color-brand) hover:underline"
        >
          Verwalten
        </Link>
      ),
    },
  ];

  return (
    <>
      {header}

      {courses.length === 0 ? (
        <EmptyState
          title="Noch keine Kurse"
          description="Erstellen Sie den ersten Kurs."
          action={
            <Link href={`/${locale}/admin/courses/new` as Route}>
              <Button>Kurs erstellen</Button>
            </Link>
          }
        />
      ) : (
        <DataTable columns={columns} rows={courses} rowKey={(c) => c.id} caption="Kurse" />
      )}
    </>
  );
}
