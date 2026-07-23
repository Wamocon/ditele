import type { Route } from "next";
import Link from "next/link";

import { Badge, Card, CardTitle, EmptyState } from "@/shared/ui";
import type { TrainerOverview } from "@/shared/data/review";

/** The trainer landing page: what is waiting and which courses they hold. */
export function TrainerOverviewScreen({
  data,
  locale,
}: {
  data: TrainerOverview;
  locale: string;
}) {
  const queueHref = `/${locale}/trainer/submissions` as Route;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
        <Link
          href={queueHref}
          className="group rounded-(--radius-lg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
        >
          <Card interactive className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
              Offene Reviews
            </span>
            <span
              className={`text-[40px] font-semibold leading-none tabular ${
                data.queueSize > 0 ? "text-(--color-brand)" : "text-(--color-fg)"
              }`}
            >
              {data.queueSize}
            </span>
            <span className="text-[13px] text-(--color-fg-muted)">
              {data.queueSize === 0 ? "Nichts zu prüfen" : "Warten auf Ihre Entscheidung"}
            </span>
          </Card>
        </Link>

        <Card className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            Zugewiesene Kurse
          </span>
          <span className="text-[40px] font-semibold leading-none tabular text-(--color-fg)">
            {data.courses.length}
          </span>
          <span className="text-[13px] text-(--color-fg-muted)">
            {data.courses.length === 1 ? "Kurs" : "Kurse"} in Ihrer Betreuung
          </span>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-[22px] font-semibold leading-7">Meine Kurse</h2>

        {data.courses.length === 0 ? (
          <EmptyState
            title="Keine Kurse zugewiesen"
            description="Sobald Ihnen ein Kurs zugewiesen wird, erscheinen hier die Einreichungen der Lernenden."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.courses.map((course) => (
              <li key={course.id}>
                <Card className="flex h-full flex-col justify-between gap-3">
                  <CardTitle>{course.title}</CardTitle>
                  <Badge tone="neutral" dot>
                    {course.studentCount} {course.studentCount === 1 ? "Lernende:r" : "Lernende"}
                  </Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
