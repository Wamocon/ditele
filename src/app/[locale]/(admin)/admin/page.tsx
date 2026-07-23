import type { Route } from "next";
import Link from "next/link";
import { Plus, BookOpen, Trophy, Users, MessageSquare, ChartColumn } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, Card, CardTitle, ErrorState, cn } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getAdminOverview } from "@/shared/data/admin";

function Tile({ label, value, href }: { label: string; value: number; href?: Route }) {
  const body = (
    <>
      <p className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">{label}</p>
      <p className="tabular mt-1 text-[30px] font-semibold leading-9">{value}</p>
    </>
  );
  return href ? (
    <Card as={Link} interactive className={cn("block")} {...({ href } as { href: Route })}>
      {body}
    </Card>
  ) : (
    <Card>{body}</Card>
  );
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const result = await getAdminOverview();

  const header = (
    <PageHeader
      title="Übersicht"
      description="Verwaltung von Kursen, Aufgaben, Benutzern und Fortschritt."
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

  const data = result.data;

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Kurse" value={data.courses} href={`/${locale}/admin/courses` as Route} />
        <Tile label="Aktive Kurse" value={data.activeCourses} href={`/${locale}/admin/courses` as Route} />
        <Tile label="Benutzer" value={data.users} href={`/${locale}/admin/users` as Route} />
        <Tile label="Offene Einreichungen" value={data.openSubmissions} href={`/${locale}/admin/progress` as Route} />
        <Tile label="Teilnehmer" value={data.students} href={`/${locale}/admin/users` as Route} />
        <Tile label="Trainer" value={data.trainers} href={`/${locale}/admin/users` as Route} />
        <Tile label="Arena-Aufgaben" value={data.arenaTasks} href={`/${locale}/admin/arena` as Route} />
        <Tile label="Badges" value={data.badges} href={`/${locale}/admin/badges` as Route} />
      </div>

      <Card className="mt-6 flex flex-col gap-3">
        <CardTitle>Verwaltung</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${locale}/admin/courses` as Route}>
            <Button size="sm" variant="outline" iconLeft={<BookOpen className="size-4" aria-hidden />}>
              Kurse
            </Button>
          </Link>
          <Link href={`/${locale}/admin/arena` as Route}>
            <Button size="sm" variant="outline" iconLeft={<Trophy className="size-4" aria-hidden />}>
              Arena
            </Button>
          </Link>
          <Link href={`/${locale}/admin/users` as Route}>
            <Button size="sm" variant="outline" iconLeft={<Users className="size-4" aria-hidden />}>
              Benutzer
            </Button>
          </Link>
          <Link href={`/${locale}/admin/feedback` as Route}>
            <Button size="sm" variant="outline" iconLeft={<MessageSquare className="size-4" aria-hidden />}>
              Feedback
            </Button>
          </Link>
          <Link href={`/${locale}/admin/progress` as Route}>
            <Button size="sm" variant="outline" iconLeft={<ChartColumn className="size-4" aria-hidden />}>
              Fortschritt
            </Button>
          </Link>
        </div>
      </Card>
    </>
  );
}
