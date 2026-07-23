"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Lock, PartyPopper } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Button, Card, CardTitle, Textarea, VideoEmbed } from "@/shared/ui";
import type { CourseCompletion, CourseDetail, CourseTaskListItem } from "@/shared/data/learning";
import { submitCourseReview } from "@/shared/data/learning-actions";
import { TaskStatusBadge, lockReasonText } from "./labels";
import { StarRating } from "./star-rating";

export function CourseDetailView({
  locale,
  detail,
  completion,
}: {
  locale: string;
  detail: CourseDetail;
  completion: CourseCompletion;
}) {
  const { course, tasks } = detail;

  return (
    <>
      <PageHeader
        title={course.title}
        breadcrumbs={[{ label: "Kurse", href: `/${locale}/learn/courses` }, { label: course.title }]}
        locale={locale}
      />

      <div className="flex flex-col gap-8">
        {course.description && (
          <p className="max-w-prose text-[15px] leading-6 text-(--color-fg-muted)">{course.description}</p>
        )}

        {course.introVideoUrl && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[18px] font-semibold">Einführung</h2>
            <VideoEmbed url={course.introVideoUrl} title="Einführungsvideo" intro locale={locale} />
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Aufgaben</h2>
          <ul className="flex list-none flex-col gap-2 p-0">
            {tasks.map((task) => (
              <li key={task.id}>
                <CourseTaskRow locale={locale} task={task} />
              </li>
            ))}
          </ul>
        </section>

        {completion.complete && (
          <CompletionSection locale={locale} courseId={course.id} completion={completion} />
        )}
      </div>
    </>
  );
}

function CourseTaskRow({ locale, task }: { locale: string; task: CourseTaskListItem }) {
  const inner = (
    <Card interactive={task.unlocked} className="flex items-center gap-3" aria-disabled={!task.unlocked}>
      <span
        className={
          task.unlocked
            ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-[14px] font-semibold text-(--color-brand) tabular-nums"
            : "flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-subtle)"
        }
      >
        {task.unlocked ? task.orderIndex : <Lock className="size-4" aria-hidden />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={task.unlocked ? "text-[15px] font-semibold" : "text-[15px] font-semibold text-(--color-fg-muted)"}>
          {task.title}
        </p>
        {task.unlocked ? (
          task.description && (
            <p className="line-clamp-1 text-[13px] text-(--color-fg-muted)">{task.description}</p>
          )
        ) : (
          <p className="text-[13px] text-(--color-fg-muted)">{lockReasonText(task.lockReason)}</p>
        )}
      </div>

      <TaskStatusBadge state={task.submissionState} />
      {task.unlocked && <ChevronRight className="size-5 shrink-0 text-(--color-fg-subtle)" aria-hidden />}
    </Card>
  );

  if (!task.unlocked) return inner;
  return (
    <Link href={`/${locale}/learn/tasks/${task.id}` as Route} className="block">
      {inner}
    </Link>
  );
}

function CompletionSection({
  locale,
  courseId,
  completion,
}: {
  locale: string;
  courseId: string;
  completion: CourseCompletion;
}) {
  return (
    <section className="flex flex-col gap-4">
      <Card rim className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-(--color-success)">
          <PartyPopper className="size-5" aria-hidden />
          Kurs abgeschlossen
        </span>
        <p className="text-[14px] text-(--color-fg-muted)">
          Du hast alle Aufgaben dieses Kurses erfolgreich abgeschlossen. Herzlichen Glückwunsch!
        </p>
      </Card>

      {completion.completionVideoUrl && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Abschlussvideo</h2>
          <VideoEmbed url={completion.completionVideoUrl} title="Abschlussvideo" locale={locale} />
        </div>
      )}

      {completion.hasReview ? (
        <Card className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-(--color-success)" aria-hidden />
          <p className="text-[14px]">Danke für deine Kursbewertung.</p>
        </Card>
      ) : (
        <ReviewForm courseId={courseId} />
      )}
    </section>
  );
}

function ReviewForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (rating < 1) {
      setError("Bitte vergib eine Bewertung von 1 bis 5 Sternen.");
      return;
    }
    if (comment.trim() === "") {
      setError("Bitte schreibe einen kurzen Kommentar zu deiner Bewertung.");
      return;
    }
    startTransition(async () => {
      const result = await submitCourseReview(courseId, rating, comment);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>Kurs bewerten</CardTitle>
        <p className="text-[14px] text-(--color-fg-muted)">
          Deine Bewertung schließt den Kurs ab. Sterne und Kommentar sind erforderlich.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">Deine Bewertung</span>
        <StarRating value={rating} onChange={setRating} label="Kursbewertung" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="course-review-comment" className="text-[14px] font-semibold">
          Kommentar
        </label>
        <Textarea
          id="course-review-comment"
          rows={4}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Was hast du gelernt? Was hat dir geholfen?"
        />
      </div>

      {error && <p className="text-[13px] font-medium text-(--color-danger)">{error}</p>}

      <Button onClick={submit} loading={pending} className="self-start">
        Bewertung absenden
      </Button>
    </Card>
  );
}
