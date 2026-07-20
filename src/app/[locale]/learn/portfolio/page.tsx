import { notFound } from "next/navigation";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { LearnerPortfolioRecordView } from "@/features/portfolio/components/learner-portfolio-record";
import { isLocale } from "@/shared/i18n/config";

import { learnerPortfolioCopy } from "./copy";
import { readLearnerPortfolioRecord } from "./data";

export default async function LearnerPortfolioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(locale, `/${locale}/learn/portfolio`, [
      "learner",
    ]))
  ) {
    return null;
  }

  const portfolio = await readLearnerPortfolioRecord();
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <LearnerPortfolioRecordView
      formatDateTime={(value) => formatter.format(new Date(value))}
      labels={learnerPortfolioCopy[locale]}
      portfolio={portfolio}
    />
  );
}
