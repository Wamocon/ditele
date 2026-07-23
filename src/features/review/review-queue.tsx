import type { Route } from "next";
import Link from "next/link";

import { Badge, DataTable, EmptyState, type Column } from "@/shared/ui";
import type { QueueItem } from "@/shared/data/review";
import { formatDateTime, taskKindLabel } from "./format";

/** The review queue: every submitted piece of work waiting for a decision. */
export function ReviewQueue({ items, locale }: { items: QueueItem[]; locale: string }) {
  const base = `/${locale}/trainer/submissions`;

  const columns: Column<QueueItem>[] = [
    {
      key: "student",
      header: "Lernende:r",
      cell: (row) => (
        <Link
          href={`${base}/${row.id}` as Route}
          className="font-semibold text-(--color-fg) underline-offset-4 hover:text-(--color-brand) hover:underline"
        >
          {row.studentName}
        </Link>
      ),
    },
    { key: "task", header: "Aufgabe", cell: (row) => row.taskTitle },
    {
      key: "kind",
      header: "Art",
      cell: (row) => (
        <Badge tone={row.taskKind === "arena" ? "brand" : "info"}>{taskKindLabel(row.taskKind)}</Badge>
      ),
    },
    {
      key: "submitted",
      header: "Eingereicht",
      cell: (row) => formatDateTime(row.submittedAt, locale),
      hideOnMobile: true,
    },
    {
      key: "open",
      header: "Aktion",
      cell: (row) => (
        <Link
          href={`${base}/${row.id}` as Route}
          className="inline-flex min-h-11 items-center font-semibold text-(--color-brand) underline-offset-4 hover:underline"
        >
          Prüfen
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(row) => row.id}
      caption="Offene Reviews"
      emptyState={
        <EmptyState
          title="Keine offenen Reviews"
          description="Sobald ein:e Lernende:r eine Aufgabe einreicht, erscheint sie hier."
        />
      }
    />
  );
}
