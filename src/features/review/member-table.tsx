import { DataTable, EmptyState, StatusBadge, type Column } from "@/shared/ui";
import type { MemberProgress } from "@/shared/data/review";
import type { Translate } from "./i18n";
import { formatDate } from "./format";

/**
 * Shared by the cohort detail and the progress screen. Table at md and above,
 * card list below — `DataTable` handles that, so a 375px screen never scrolls
 * sideways.
 */
export function MemberTable({
  members,
  locale,
  t,
  emptyTitle,
  emptyText,
  showRole = false,
}: {
  members: MemberProgress[];
  locale: string;
  t: Translate;
  emptyTitle: string;
  emptyText: string;
  showRole?: boolean;
}) {
  const columns: Column<MemberProgress>[] = [
    {
      key: "name",
      header: t("trainer.shared.learner"),
      cell: (row) => <span className="font-semibold">{row.name}</span>,
    },
    ...(showRole
      ? [
          {
            key: "role",
            header: t("trainer.groups.role"),
            cell: (row: MemberProgress) =>
              row.role === "trainer" ? t("trainer.groups.roleTrainer") : t("trainer.groups.roleLearner"),
          },
        ]
      : []),
    {
      key: "submitted",
      header: t("trainer.progress.submitted"),
      numeric: true,
      cell: (row) => row.submitted,
    },
    {
      key: "accepted",
      header: t("trainer.progress.accepted"),
      numeric: true,
      cell: (row) => row.accepted,
    },
    {
      key: "revision",
      header: t("trainer.progress.revision"),
      numeric: true,
      cell: (row) => row.revisionRequired,
    },
    {
      key: "questions",
      header: t("trainer.progress.questions"),
      numeric: true,
      cell: (row) => row.openQuestions,
    },
    {
      key: "last",
      header: t("trainer.progress.lastActivity"),
      hideOnMobile: true,
      cell: (row) =>
        row.lastActivityAt ? formatDate(row.lastActivityAt, locale) : t("trainer.progress.never"),
    },
    {
      key: "state",
      header: t("trainer.shared.state"),
      cell: (row) => <StatusBadge state={row.membershipState} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={members}
      rowKey={(row) => row.userId}
      caption={t("trainer.progress.title")}
      emptyState={<EmptyState title={emptyTitle} description={emptyText} />}
    />
  );
}
