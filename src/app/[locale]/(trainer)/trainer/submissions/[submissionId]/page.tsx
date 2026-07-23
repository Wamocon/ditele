import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getSubmissionForReview } from "@/shared/data/review";
import { ReviewScreen } from "@/features/review/review-screen";

export const metadata: Metadata = { title: "Review" };

/** The review screen for one submission. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; submissionId: string }>;
}) {
  const { locale, submissionId } = await params;
  await requireRole(["trainer", "admin"], locale);

  const queueHref = `/${locale}/trainer/submissions`;
  const result = await getSubmissionForReview(submissionId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title="Einreichung nicht gefunden"
          locale={locale}
          breadcrumbs={[{ label: "Reviews", href: queueHref }]}
        />
        <ErrorState title="Einreichung nicht gefunden" message={result.error.message} />
        <Link
          href={queueHref as Route}
          className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-(--color-brand) underline-offset-4 hover:underline"
        >
          Zurück zur Übersicht
        </Link>
      </>
    );
  }

  const review = result.data;
  const title = review.course?.title ?? review.arena?.title ?? "Review";

  return (
    <>
      <PageHeader
        title={title}
        description={review.studentName}
        locale={locale}
        breadcrumbs={[{ label: "Reviews", href: queueHref }, { label: "Review" }]}
      />
      <ReviewScreen review={review} locale={locale} />
    </>
  );
}
