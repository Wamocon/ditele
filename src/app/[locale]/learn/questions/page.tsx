import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { LearnerQuestionForm } from "@/features/mentoring/learner-question-form";
import { QuestionList } from "@/features/mentoring/question-list";
import {
  questionWorkflowCopy,
  toLearnerQuestionActionCopy,
} from "@/features/mentoring/question-workflow-copy";
import { readLearnerQuestionWorkspace } from "@/features/mentoring/server/question-workflow-data";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";

import { createQuestionAction } from "./actions";

export default async function LearnerQuestionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/learn/questions`,
      ["learner"],
    ))
  ) {
    return null;
  }

  const { contexts, questions } = await readLearnerQuestionWorkspace(locale);
  const copy = questionWorkflowCopy[locale];
  const actionCopy = toLearnerQuestionActionCopy(copy.learner);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const action = createQuestionAction.bind(null, locale);

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{copy.learner.title}</h1>
          <p className="muted reading-column">{copy.learner.description}</p>
        </div>
      </header>

      <LearnerQuestionForm
        action={action}
        contexts={contexts}
        idempotencyKey={`question-create:${randomUUID()}`}
        labels={actionCopy}
      />

      <section aria-labelledby="learner-question-history" className="stack">
        <header className="page-heading">
          <div>
            <h2 id="learner-question-history">{copy.learner.historyTitle}</h2>
            <p className="muted">{copy.learner.historyCount(questions.length)}</p>
          </div>
        </header>
        <QuestionList
          detailHref={(questionId) =>
            localizedDynamicRoute(locale, `/learn/questions/${questionId}`)
          }
          emptyDescription={copy.learner.emptyDescription}
          emptyTitle={copy.learner.emptyTitle}
          formatDateTime={(value) => formatter.format(new Date(value))}
          items={questions}
          labels={copy.common}
          openLabel={copy.learner.openDetail}
        />
      </section>
    </div>
  );
}
