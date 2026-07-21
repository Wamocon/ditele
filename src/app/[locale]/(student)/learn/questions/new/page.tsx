import { MessageCircle } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Card, EmptyState, ErrorState } from "@/shared/ui";
import { listAskableContexts } from "@/shared/data/questions";
import { LinkButton } from "@/features/questions/components/link-button";
import { getWs3Messages } from "@/features/questions/i18n";
import { AskForm } from "./ask-form";

export default async function NewQuestionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.questionNew;

  const breadcrumbs = [
    { label: messages.learn.questions.title, href: `/${locale}/learn/questions` },
    { label: t.breadcrumb },
  ];

  const result = await listAskableContexts(locale);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} breadcrumbs={breadcrumbs} />
        <ErrorState title={messages.learn.shared.loadErrorTitle} message={result.error.message} />
      </>
    );
  }

  if (result.data.length === 0) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} breadcrumbs={breadcrumbs} />
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          icon={<MessageCircle className="size-6 text-(--color-fg-subtle)" aria-hidden />}
          action={
            <LinkButton href={`/${locale}/learn/courses`} variant="outline">
              {messages.nav.courses}
            </LinkButton>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.title} description={t.description} breadcrumbs={breadcrumbs} />
      <Card>
        <AskForm
          locale={locale}
          contexts={result.data}
          labels={{
            contextLabel: t.contextLabel,
            contextHint: t.contextHint,
            contextPlaceholder: t.contextPlaceholder,
            subjectLabel: t.subjectLabel,
            subjectHint: t.subjectHint,
            subjectPlaceholder: t.subjectPlaceholder,
            bodyLabel: t.bodyLabel,
            bodyHint: t.bodyHint,
            bodyPlaceholder: t.bodyPlaceholder,
            submit: t.submit,
            unknownTask: messages.learn.shared.unknownTask,
          }}
        />
      </Card>
    </>
  );
}
