import { DataTable, EmptyState, type Column } from "@/shared/ui";
import type { ProgressRow } from "@/shared/data/review";

/** Where each learner stands in both chains, for the trainer's courses. */
export function ProgressTable({ rows }: { rows: ProgressRow[] }) {
  const columns: Column<ProgressRow>[] = [
    {
      key: "student",
      header: "Lernende:r",
      cell: (row) => <span className="font-semibold">{row.studentName}</span>,
    },
    {
      key: "courses",
      header: "Kurs(e)",
      cell: (row) => (row.courseTitles.length > 0 ? row.courseTitles.join(", ") : "—"),
      hideOnMobile: true,
    },
    {
      key: "courseTasks",
      header: "Kursaufgaben",
      cell: (row) => row.acceptedCourseTasks,
      numeric: true,
    },
    {
      key: "arenaTasks",
      header: "Arena-Aufgaben",
      cell: (row) => row.acceptedArenaTasks,
      numeric: true,
    },
    {
      key: "xp",
      header: "XP",
      cell: (row) => row.totalXp,
      numeric: true,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.studentId}
      caption="Fortschritt der Lernenden"
      emptyState={
        <EmptyState
          title="Keine Lernenden"
          description="In Ihren Kursen ist noch niemand eingeschrieben."
        />
      }
    />
  );
}
