import { Star } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Card, EmptyState, ErrorState, cn } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listTaskEmojiFeedback, listCourseReviews } from "@/shared/data/admin";

function formatDate(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "";
  }
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireRole(["admin"], locale);

  const [emojiResult, reviewResult] = await Promise.all([listTaskEmojiFeedback(), listCourseReviews()]);

  const header = <PageHeader title="Feedback" description="Emoji-Feedback pro Aufgabe und Kursbewertungen." locale={locale} />;

  if (!emojiResult.ok) {
    return (
      <>
        {header}
        <ErrorState message={emojiResult.error.message} />
      </>
    );
  }
  if (!reviewResult.ok) {
    return (
      <>
        {header}
        <ErrorState message={reviewResult.error.message} />
      </>
    );
  }

  const emojis = emojiResult.data;
  const reviews = reviewResult.data;

  return (
    <>
      {header}

      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold leading-6">Kursbewertungen (5 Sterne + Text)</h2>
          {reviews.length === 0 ? (
            <EmptyState title="Noch keine Kursbewertungen" description="Bewertungen erscheinen, sobald Teilnehmer einen Kurs abschließen." />
          ) : (
            <ul className="flex flex-col gap-2">
              {reviews.map((row) => (
                <li key={row.id}>
                  <Card className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold">{row.courseTitle}</span>
                      <div className="flex items-center gap-0.5" aria-label={`${row.rating} / 5`}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <Star
                            key={value}
                            className={cn(
                              "size-5",
                              value <= row.rating
                                ? "fill-(--color-warning) text-(--color-warning)"
                                : "text-(--color-fg-subtle)"
                            )}
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>
                    {row.comment && (
                      <p className="whitespace-pre-line text-[14px] leading-6 text-(--color-fg-muted)">{row.comment}</p>
                    )}
                    <p className="text-[12px] text-(--color-fg-subtle)">
                      {row.studentName} · {formatDate(row.created_at, locale)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold leading-6">Emoji-Feedback pro Aufgabe</h2>
          {emojis.length === 0 ? (
            <EmptyState title="Noch kein Emoji-Feedback" description="Teilnehmer wählen nach dem Einreichen einer Aufgabe ein Emoji." />
          ) : (
            <ul className="flex flex-col gap-2">
              {emojis.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-(--radius-md) border border-(--color-border) px-3 py-2"
                >
                  <span className="text-[24px] leading-none" aria-hidden>
                    {row.emoji}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium">{row.taskTitle}</span>
                    <span className="text-[12px] text-(--color-fg-subtle)">
                      {row.studentName} · {row.courseTitle} · {formatDate(row.created_at, locale)}
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
