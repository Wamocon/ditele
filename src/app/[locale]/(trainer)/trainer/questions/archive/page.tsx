import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listQuestions } from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { QuestionList } from "@/features/review/question-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.questions.archiveTitle") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const result = await listQuestions({ locale, archived: true });

  return (
    <>
      <PageHeader
        title={t("trainer.questions.archiveTitle")}
        description={t("trainer.questions.archiveDescription")}
        breadcrumbs={[
          { label: t("trainer.questions.title"), href: `/${locale}/trainer/questions` },
          { label: t("trainer.questions.archiveTitle") },
        ]}
        actions={
          <Link
            href={`/${locale}/trainer/questions` as Route}
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[--color-brand] underline-offset-4 hover:underline"
          >
            {t("trainer.questions.backToQuestions")}
          </Link>
        }
      />

      {result.ok ? (
        <QuestionList
          items={result.data.items}
          locale={locale}
          t={t}
          showWaiting={false}
          emptyTitle={t("trainer.questions.archiveEmptyTitle")}
          emptyText={t("trainer.questions.archiveEmptyText")}
        />
      ) : (
        <ErrorState message={result.error.message} />
      )}
    </>
  );
}
