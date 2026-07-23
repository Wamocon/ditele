import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { Badge, ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listReviewQueue } from "@/shared/data/review";
import { ReviewQueue } from "@/features/review/review-queue";

export const metadata: Metadata = { title: "Reviews" };

/** The queue of submitted course and arena work for the trainer's courses. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["trainer", "admin"], locale);

  const result = await listReviewQueue();

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Eingereichte Kurs- und Arena-Aufgaben, neueste zuerst."
        actions={
          result.ok ? (
            <Badge tone={result.data.length > 0 ? "brand" : "neutral"} dot>
              {result.data.length} offen
            </Badge>
          ) : undefined
        }
      />
      {result.ok ? (
        <ReviewQueue items={result.data} locale={locale} />
      ) : (
        <ErrorState message={result.error.message} />
      )}
    </>
  );
}
