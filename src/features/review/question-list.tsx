import type { Route } from "next";
import Link from "next/link";
import { DataTable, EmptyState, StatusBadge, type Column } from "@/shared/ui";
import type { QuestionItem } from "@/shared/data/review";
import type { Translate } from "./i18n";
import { formatDateTime } from "./format";
import { AgeBadge } from "./age-badge";

/** Shared by the open queue and the archive — same columns, different rows. */
export function QuestionList({
  items,
  locale,
  t,
  emptyTitle,
  emptyText,
  showWaiting = true,
}: {
  items: QuestionItem[];
  locale: string;
  t: Translate;
  emptyTitle: string;
  emptyText: string;
  showWaiting?: boolean;
}) {
  const href = (id: string) => `/${locale}/trainer/questions/${id}` as Route;

  const columns: Column<QuestionItem>[] = [
    {
      key: "subject",
      header: t("trainer.questions.subject"),
      cell: (row) => (
        <Link
          href={href(row.id)}
          className="font-semibold text-(--color-fg) underline-offset-4 hover:text-(--color-brand) hover:underline"
        >
          {row.subject}
        </Link>
      ),
    },
    { key: "learner", header: t("trainer.shared.learner"), cell: (row) => row.learnerName },
    { key: "task", header: t("trainer.shared.task"), cell: (row) => row.taskTitle, hideOnMobile: true },
    {
      key: "assigned",
      header: t("trainer.questions.assignedTo"),
      cell: (row) => row.assignedTrainerName ?? t("trainer.questions.unassigned"),
      hideOnMobile: true,
    },
    {
      key: "asked",
      header: t("trainer.questions.askedAt"),
      cell: (row) =>
        showWaiting ? (
          <AgeBadge hours={row.waitingHours} t={t} />
        ) : (
          formatDateTime(row.createdAt, locale)
        ),
    },
    { key: "state", header: t("trainer.shared.state"), cell: (row) => <StatusBadge state={row.state} /> },
    {
      key: "open",
      header: t("trainer.questions.open"),
      cell: (row) => (
        <Link
          href={href(row.id)}
          className="inline-flex min-h-11 items-center font-semibold text-(--color-brand) underline-offset-4 hover:underline"
        >
          {t("trainer.questions.open")}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(row) => row.id}
      caption={t("trainer.questions.title")}
      emptyState={<EmptyState title={emptyTitle} description={emptyText} />}
    />
  );
}
