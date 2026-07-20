import { notFound } from "next/navigation";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { LearnerSkillsOverview } from "@/features/skills/components/learner-skills-overview";
import { isLocale } from "@/shared/i18n/config";

import { learnerSkillsCopy } from "./copy";
import { readLearnerSkillCollection } from "./data";

export default async function LearnerSkillsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(locale, `/${locale}/learn/skills`, [
      "learner",
    ]))
  ) {
    return null;
  }

  const collection = await readLearnerSkillCollection(locale);
  const percentFormatter = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <LearnerSkillsOverview
      collection={collection}
      formatDateTime={(value) => dateFormatter.format(new Date(value))}
      formatPercent={(basisPoints) => percentFormatter.format(basisPoints / 10_000)}
      labels={learnerSkillsCopy[locale]}
    />
  );
}
