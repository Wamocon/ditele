import Link from "next/link";
import { notFound } from "next/navigation";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { QuestionList } from "@/features/mentoring/question-list";
import { questionWorkflowCopy } from "@/features/mentoring/question-workflow-copy";
import { readTrainerQuestionQueue } from "@/features/mentoring/server/question-workflow-data";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";

export default async function TrainerQuestionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/questions`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }

  const questions = await readTrainerQuestionQueue(locale, false);
  const copy = questionWorkflowCopy[locale];
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{copy.trainer.title}</h1>
          <p className="muted reading-column">{copy.trainer.description}</p>
          <p>{copy.trainer.queueCount(questions.length)}</p>
        </div>
        <Link
          className="button button--secondary"
          href={localizedDynamicRoute(locale, "/trainer/questions/archive")}
        >
          {copy.trainer.archiveLink}
        </Link>
      </header>

      <QuestionList
        detailHref={(questionId) =>
          localizedDynamicRoute(locale, `/trainer/questions/${questionId}`)
        }
        emptyDescription={copy.trainer.emptyDescription}
        emptyTitle={copy.trainer.emptyTitle}
        formatDateTime={(value) => formatter.format(new Date(value))}
        items={questions}
        labels={copy.common}
        openLabel={copy.trainer.openDetail}
      />
    </div>
  );
}

