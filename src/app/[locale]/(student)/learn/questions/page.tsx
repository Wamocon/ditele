import type { Route } from "next";
import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Badge, DataTable, EmptyState, ErrorState, StatusBadge, type Column } from "@/shared/ui";
import { listMyQuestions, type QuestionListItem } from "@/shared/data/questions";
import { LinkButton } from "@/features/questions/components/link-button";
import { getWs3Messages } from "@/features/questions/i18n";
import { formatDate } from "@/features/questions/format";

const PAGE_SIZE = 50;

export default async function QuestionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.questions;

  const result = await listMyQuestions({ limit: PAGE_SIZE });

  const askAction = (
    <LinkButton
      href={`/${locale}/learn/questions/new`}
      iconLeft={<Plus className="size-4" aria-hidden />}
    >
      {t.ask}
    </LinkButton>
  );

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} actions={askAction} />
        <ErrorState title={messages.learn.shared.loadErrorTitle} message={result.error.message} />
      </>
    );
  }

  const { items } = result.data;

  const columns: Column<QuestionListItem>[] = [
    {
      key: "subject",
      header: t.columnSubject,
      cell: (row) => (
        <Link
          href={`/${locale}/learn/questions/${row.id}` as Route}
          className="font-semibold text-(--color-fg) hover:text-(--color-brand) hover:underline"
        >
          {row.subject}
        </Link>
      ),
    },
    {
      key: "task",
      header: t.columnTask,
      cell: (row) => (
        <span className="text-(--color-fg-muted)">
          {row.taskTitle ?? messages.learn.shared.unknownTask}
        </span>
      ),
    },
    {
      key: "state",
      header: t.columnState,
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusBadge state={row.state} />
          {row.isWaiting && (
            <Badge tone="warning" dot>
              {t.waitingForAnswer}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "updated",
      header: t.columnUpdated,
      numeric: true,
      cell: (row) => formatDate(row.updated_at, locale),
    },
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.description} actions={askAction} />

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        caption={t.title}
        emptyState={
          <EmptyState
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<MessageCircle className="size-6 text-(--color-fg-subtle)" aria-hidden />}
            action={askAction}
          />
        }
      />
    </>
  );
}
