import { MessageCircle, Plus } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Card, EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { getQuestionThread, type QuestionMessage } from "@/shared/data/questions";
import { LinkButton } from "@/features/questions/components/link-button";
import { getWs3Messages, type Ws3Messages } from "@/features/questions/i18n";
import { formatDateTime, initials } from "@/features/questions/format";

export default async function QuestionThreadPage({
  params,
}: {
  params: Promise<{ locale: string; questionId: string }>;
}) {
  const { locale, questionId } = await params;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.questionThread;

  const breadcrumbs = [
    { label: messages.learn.questions.title, href: `/${locale}/learn/questions` },
    { label: t.breadcrumb },
  ];

  const result = await getQuestionThread(questionId);

  if (!result.ok) {
    // A question that belongs to someone else is invisible under RLS, so
    // "forbidden" and "does not exist" arrive as the same thing. Say that
    // honestly instead of pretending the row is missing.
    const notFound = result.error.code === "PGRST116";
    return (
      <>
        <PageHeader title={t.title} breadcrumbs={breadcrumbs} />
        {notFound ? (
          <EmptyState
            title={t.notFoundTitle}
            description={t.notFoundDescription}
            icon={<MessageCircle className="size-6 text-(--color-fg-subtle)" aria-hidden />}
            action={
              <LinkButton href={`/${locale}/learn/questions`} variant="outline">
                {t.backToList}
              </LinkButton>
            }
          />
        ) : (
          <ErrorState title={messages.learn.shared.loadErrorTitle} message={result.error.message} />
        )}
      </>
    );
  }

  const { question, taskTitle, messages: thread, participants, myUserId } = result.data;

  return (
    <>
      <PageHeader
        title={question.subject}
        description={taskTitle ?? messages.learn.shared.unknownTask}
        breadcrumbs={breadcrumbs}
        actions={<StatusBadge state={question.state} locale={locale} />}
      />

      <dl className="mb-6 grid gap-x-8 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {t.taskLabel}
          </dt>
          <dd className="text-[15px] leading-6">{taskTitle ?? messages.learn.shared.unknownTask}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {t.askedAt}
          </dt>
          <dd className="tabular text-[15px] leading-6">{formatDateTime(question.created_at, locale)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {t.answeredAt}
          </dt>
          <dd className="tabular text-[15px] leading-6">
            {formatDateTime(question.answered_at, locale)}
          </dd>
        </div>
      </dl>

      <h2 className="mb-3 text-[22px] font-semibold leading-7">{t.messagesTitle}</h2>

      {thread.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
      ) : (
        <ul className="flex flex-col gap-3">
          {thread.map((message, index) => (
            <li
              key={message.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
            >
              <Message
                message={message}
                locale={locale}
                t={t}
                authorName={
                  message.author_id === myUserId
                    ? t.you
                    : (participants.get(message.author_id) ?? messages.learn.shared.unknownPerson)
                }
                // The avatar always uses the real name, even on your own
                // messages where the byline reads "Du".
                avatarName={
                  participants.get(message.author_id) ?? messages.learn.shared.unknownPerson
                }
                isMine={message.author_id === myUserId}
              />
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-8 flex flex-col items-start gap-3 border-dashed">
        <div>
          <p className="text-[15px] font-semibold leading-6">{t.noReplyTitle}</p>
          <p className="mt-1 max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">
            {t.noReplyDescription}
          </p>
        </div>
        <LinkButton
          href={`/${locale}/learn/questions/new`}
          iconLeft={<Plus className="size-4" aria-hidden />}
        >
          {t.askAnother}
        </LinkButton>
      </Card>
    </>
  );
}

function Message({
  message,
  locale,
  t,
  authorName,
  avatarName,
  isMine,
}: {
  message: QuestionMessage;
  locale: string;
  t: Ws3Messages["learn"]["questionThread"];
  authorName: string;
  avatarName: string;
  isMine: boolean;
}) {
  // A system row is a machine log line, not a reply. It gets a quieter
  // treatment so the real conversation stays readable.
  if (message.message_kind === "system") {
    return (
      <p className="px-3 py-1 text-[13px] leading-5 text-(--color-fg-subtle)">
        <span className="font-semibold">{t.systemNote}</span> · {message.body} ·{" "}
        <span className="tabular">{formatDateTime(message.created_at, locale)}</span>
      </p>
    );
  }

  return (
    <Card className={isMine ? undefined : "bg-(--color-surface)"}>
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--color-surface-2) text-[13px] font-semibold text-(--color-fg-muted)"
          aria-hidden
        >
          {initials(avatarName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-[15px] font-semibold leading-6">{authorName}</p>
            {!isMine && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
                {t.trainerRole}
              </span>
            )}
            <span className="tabular text-[13px] leading-5 text-(--color-fg-muted)">
              {formatDateTime(message.created_at, locale)}
            </span>
          </div>
          <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6">{message.body}</p>
        </div>
      </div>
    </Card>
  );
}
