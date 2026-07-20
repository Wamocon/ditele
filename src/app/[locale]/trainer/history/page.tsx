import { notFound } from "next/navigation";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { TrainerReviewHistoryView } from "@/features/review/components/trainer-review-history-view";
import {
  readTrainerReviewHistory,
  TRAINER_REVIEW_HISTORY_LIMIT,
} from "@/features/review/server/trainer-history-data";
import { trainerHistoryCopy } from "@/features/review/trainer-history-copy";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";
import { StatePanel } from "@/shared/ui/state-panel";

export default async function TrainerHistoryPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/history`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }

  const principal = await getPrincipal();
  const labels = trainerHistoryCopy[locale];
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

  const items = await readTrainerReviewHistory(principal, locale);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <TrainerReviewHistoryView
      formatDateTime={(value) => formatter.format(new Date(value))}
      items={items}
      labels={labels}
      limit={TRAINER_REVIEW_HISTORY_LIMIT}
      submissionHref={(submissionId) =>
        localizedDynamicRoute(locale, `/trainer/submissions/${submissionId}`)
      }
    />
  );
}
