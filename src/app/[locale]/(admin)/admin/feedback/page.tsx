import type { Metadata } from "next";
import { Frown, Meh, Smile, Star } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Card, EmptyState, ErrorState, cn } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listAdminFeedback } from "@/shared/data/feedback";
import { adminStrings } from "@/features/content/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const s = adminStrings(locale).feedback;
  return { title: `${s.title} · DiTeLe`, description: s.description };
}

function SentimentIcon({ sentiment }: { sentiment: string }) {
  const className = "size-6 shrink-0";
  if (sentiment === "happy")
    return <Smile className={cn(className, "text-(--color-success)")} aria-hidden />;
  if (sentiment === "unhappy")
    return <Frown className={cn(className, "text-(--color-danger)")} aria-hidden />;
  return <Meh className={cn(className, "text-(--color-warning)")} aria-hidden />;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "";
  }
}

/**
 * Every piece of learner feedback in one place — the task emojis and the course
 * ratings — read through the two admin-only enriched functions. Newest first,
 * so a trainer scanning the room sees today's reactions at the top.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { principal } = await requireRole(["admin"], locale);
  const s = adminStrings(locale).feedback;

  const result = principal.organizationId
    ? await listAdminFeedback(principal.organizationId)
    : null;

  if (result && !result.ok) {
    return (
      <>
        <PageHeader title={s.title} description={s.description} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  const tasks = result?.ok ? result.data.tasks : [];
  const courses = result?.ok ? result.data.courses : [];
  const sentimentLabel = (value: string) =>
    value === "happy" ? s.sentimentHappy : value === "unhappy" ? s.sentimentUnhappy : s.sentimentNeutral;

  return (
    <>
      <PageHeader title={s.title} description={s.description} />

      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold leading-6">{s.courseHeading}</h2>
          {courses.length === 0 ? (
            <EmptyState title={s.courseEmpty} description={s.courseEmptyDescription} />
          ) : (
            <ul className="flex flex-col gap-2">
              {courses.map((row, index) => (
                <li key={`${row.courseId}-${index}`}>
                  <Card className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold">{row.courseTitle}</span>
                      <div className="flex items-center gap-0.5" aria-label={`${row.stars} / 5`}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <Star
                            key={value}
                            className={cn(
                              "size-5",
                              value <= row.stars
                                ? "fill-(--color-warning) text-(--color-warning)"
                                : "text-(--color-fg-subtle)"
                            )}
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>
                    {row.comment && (
                      <p className="whitespace-pre-line text-[14px] leading-6 text-(--color-fg-muted)">
                        {row.comment}
                      </p>
                    )}
                    <p className="text-[12px] text-(--color-fg-subtle)">
                      {(row.learnerName || s.anonymous) +
                        (row.submittedAt ? ` · ${formatDate(row.submittedAt, locale)}` : "")}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold leading-6">{s.taskHeading}</h2>
          {tasks.length === 0 ? (
            <EmptyState title={s.taskEmpty} description={s.taskEmptyDescription} />
          ) : (
            <ul className="flex flex-col gap-2">
              {tasks.map((row, index) => (
                <li
                  key={`${row.taskId}-${index}`}
                  className="flex items-center gap-3 rounded-(--radius-md) border border-(--color-border) px-3 py-2"
                >
                  <SentimentIcon sentiment={row.sentiment} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium">{row.taskTitle}</span>
                    <span className="text-[12px] text-(--color-fg-subtle)">
                      {(row.learnerName || s.anonymous) +
                        " · " +
                        sentimentLabel(row.sentiment) +
                        (row.submittedAt ? ` · ${formatDate(row.submittedAt, locale)}` : "")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
