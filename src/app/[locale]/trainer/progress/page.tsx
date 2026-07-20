import { notFound } from "next/navigation";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { TrainerProgressView } from "@/features/cohorts/components/trainer-progress-view";
import { readTrainerLearnerProgress } from "@/features/cohorts/server/trainer-read-data";
import { trainerProgressCopy } from "@/features/cohorts/trainer-read-copy";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default async function TrainerProgressPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/progress`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }

  const principal = await getPrincipal();
  const labels = trainerProgressCopy[locale];
  if (
    !hasPermission(principal, "cohort.read") ||
    !hasPermission(principal, "review.manage")
  ) {
    return (
      <StatePanel
        description={labels.forbiddenDescription}
        title={labels.forbiddenTitle}
        tone="danger"
      />
    );
  }

  const items = await readTrainerLearnerProgress(principal, locale);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <TrainerProgressView
      formatDateTime={(value) => formatter.format(new Date(value))}
      items={items}
      labels={labels}
    />
  );
}
