import { notFound } from "next/navigation";
import { z } from "zod";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { ArchiveQuestionForm } from "@/features/mentoring/learner-question-form";
import { QuestionThreadView } from "@/features/mentoring/question-thread-view";
import {
  questionWorkflowCopy,
  toLearnerQuestionActionCopy,
} from "@/features/mentoring/question-workflow-copy";
import { readLearnerQuestionDetail } from "@/features/mentoring/server/question-workflow-data";
import { isLocale } from "@/shared/i18n/config";
import { localizedRoute } from "@/shared/i18n/routes";

import { archiveQuestionAction } from "../actions";

export default async function LearnerQuestionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; questionId: string }>;
}) {
  const { locale, questionId } = await params;
  if (!isLocale(locale) || !z.string().uuid().safeParse(questionId).success) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/learn/questions/${questionId}`,
      ["learner"],
    ))
  ) {
    return null;
  }

  const question = await readLearnerQuestionDetail(locale, questionId);
  if (!question) notFound();
  const copy = questionWorkflowCopy[locale];
  const actionCopy = toLearnerQuestionActionCopy(copy.learner);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const archiveAction = archiveQuestionAction.bind(null, locale);

  return (
    <QuestionThreadView
      actions={question.state !== "archived" ? (
        <ArchiveQuestionForm
          action={archiveAction}
          expectedVersion={question.version}
          labels={actionCopy}
          questionId={question.id}
        />
      ) : undefined}
      backHref={localizedRoute(locale, "/learn/questions")}
      formatDateTime={(value) => formatter.format(new Date(value))}
      labels={copy.common}
      openExplanation={copy.learner.openExplanation}
      question={question}
    />
  );
}
