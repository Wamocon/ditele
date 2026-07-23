import { PageHeader } from "@/shared/layout";
import { Badge, EmptyState, ErrorState, DataTable, StatusBadge, type Column } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listStudentProgress, type StudentProgressRow } from "@/shared/data/admin";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const result = await listStudentProgress();

  const header = (
    <PageHeader
      title="Fortschritt"
      description="Position jedes Teilnehmers in beiden Ketten, Gesamt-XP und Badges."
      locale={locale}
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

  const rows = result.data;

  const columns: Column<StudentProgressRow>[] = [
    { key: "student", header: "Teilnehmer", cell: (r) => <span className="font-medium">{r.studentName}</span> },
    { key: "course", header: "Kurs", cell: (r) => <span className="text-(--color-fg-muted)">{r.courseTitle}</span> },
    { key: "state", header: "Status", cell: (r) => <StatusBadge state={r.enrollmentState} locale={locale} /> },
    { key: "courseTasks", header: "Kursaufgaben ✓", numeric: true, cell: (r) => r.acceptedCourseTasks },
    { key: "arenaTasks", header: "Arena ✓", numeric: true, cell: (r) => r.acceptedArenaTasks },
    {
      key: "xp",
      header: "XP",
      numeric: true,
      cell: (r) => (
        <Badge tone="info">{r.totalXp} XP</Badge>
      ),
    },
    { key: "badges", header: "Badges", numeric: true, cell: (r) => r.badgeCount },
  ];

  return (
    <>
      {header}

      {rows.length === 0 ? (
        <EmptyState
          title="Noch kein Fortschritt"
          description="Sobald Teilnehmer eingeschrieben sind und Aufgaben bearbeiten, erscheint hier ihr Fortschritt."
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} caption="Teilnehmerfortschritt" />
      )}
    </>
  );
}
