import { notFound } from "next/navigation";

import { ReviewQueue } from "@/features/review/components/review-queue";
import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";

import { reviewQueueCopy } from "../review-copy";
import { readReviewQueue } from "../review-queue-data";

export default async function TrainerSubmissionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/submissions`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }
  const items = await readReviewQueue(locale);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="stack">
      <header className="page-heading">
        <h1>{reviewQueueCopy[locale].title}</h1>
      </header>
      <ReviewQueue
        formatDateTime={(value) => formatter.format(new Date(value))}
        items={items}
        labels={reviewQueueCopy[locale]}
        reviewHref={(id) =>
          localizedDynamicRoute(locale, `/trainer/submissions/${id}`)
        }
      />
    </div>
  );
}
