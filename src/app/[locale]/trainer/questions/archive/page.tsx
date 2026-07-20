import Link from "next/link";
import { notFound } from "next/navigation";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { QuestionList } from "@/features/mentoring/question-list";
import { questionWorkflowCopy } from "@/features/mentoring/question-workflow-copy";
import { readTrainerQuestionQueue } from "@/features/mentoring/server/question-workflow-data";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";

export default async function TrainerQuestionArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/questions/archive`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }

  const questions = await readTrainerQuestionQueue(locale, true);
  const copy = questionWorkflowCopy[locale];
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{copy.trainer.archiveTitle}</h1>
          <p className="muted reading-column">{copy.trainer.archiveDescription}</p>
        </div>
        <Link
          className="button button--secondary"
          href={localizedRoute(locale, "/trainer/questions")}
        >
          {copy.trainer.queueLink}
        </Link>
      </header>

      <QuestionList
        detailHref={(questionId) =>
          localizedDynamicRoute(locale, `/trainer/questions/${questionId}`)
        }
        emptyDescription={copy.trainer.archiveEmptyDescription}
        emptyTitle={copy.trainer.archiveEmptyTitle}
        formatDateTime={(value) => formatter.format(new Date(value))}
        items={questions}
        labels={copy.common}
        openLabel={copy.trainer.openDetail}
      />
    </div>
  );
}

