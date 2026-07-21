import { BookOpen, Clock } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Card, CardDescription, CardTitle, EmptyState, ErrorState, StatusBadge } from "@/shared/ui";
import { getCourseSummary, getMyEnrollmentForCourse, type Enrollment } from "@/shared/data/profile";
import { LinkButton } from "@/features/questions/components/link-button";
import { getWs3Messages, type Ws3Messages } from "@/features/questions/i18n";
import { formatDate } from "@/features/questions/format";
import { EnrollForm } from "./enroll-form";

export default async function EnrollPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.enroll;

  const breadcrumbs = [
    { label: messages.nav.courses, href: `/${locale}/learn/courses` },
    { label: t.breadcrumb },
  ];

  const [courseResult, enrollmentResult] = await Promise.all([
    getCourseSummary(courseId, locale),
    getMyEnrollmentForCourse(courseId),
  ]);

  if (!courseResult.ok) {
    const notFound = courseResult.error.code === "PGRST116";
    return (
      <>
        <PageHeader title={t.title} breadcrumbs={breadcrumbs} />
        {notFound ? (
          <EmptyState
            title={t.notFoundTitle}
            description={t.notFoundDescription}
            icon={<BookOpen className="size-6 text-[--color-fg-subtle]" aria-hidden />}
            action={
              <LinkButton href={`/${locale}/catalog`} variant="outline">
                {t.toCatalog}
              </LinkButton>
            }
          />
        ) : (
          <ErrorState
            title={messages.learn.shared.loadErrorTitle}
            message={courseResult.error.message}
          />
        )}
      </>
    );
  }

  const course = courseResult.data;
  const enrollment = enrollmentResult.ok ? enrollmentResult.data : null;

  return (
    <>
      <PageHeader title={t.title} description={t.description} breadcrumbs={breadcrumbs} />

      <div className="flex flex-col gap-6">
        <Card as="section">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[--color-fg-muted]">
            {t.courseLabel}
          </p>
          <CardTitle className="mt-1 text-[22px] leading-7">{course.title}</CardTitle>
          {course.summary && <CardDescription className="mt-2">{course.summary}</CardDescription>}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-[--color-fg-muted]">
            {course.estimatedMinutes !== null && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                <span className="tabular">{course.estimatedMinutes}</span>{" "}
                {messages.learn.shared.minutesShort}
              </span>
            )}
            {course.taskCount !== null && (
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="size-4" aria-hidden />
                <span className="tabular">{course.taskCount}</span> {messages.nav.tasks}
              </span>
            )}
          </div>

          {course.learningOutcomes.length > 0 && (
            <ul className="mt-4 flex max-w-[68ch] list-disc flex-col gap-1 pl-5 text-[15px] leading-6">
              {course.learningOutcomes.map((outcome) => (
                <li key={outcome}>{outcome}</li>
              ))}
            </ul>
          )}
        </Card>

        {enrollment ? (
          <EnrollmentStatus enrollment={enrollment} locale={locale} t={t} courseId={courseId} />
        ) : (
          <Card as="section">
            <EnrollForm
              locale={locale}
              courseId={courseId}
              labels={{
                noteLabel: t.noteLabel,
                noteHint: t.noteHint,
                notePlaceholder: t.notePlaceholder,
                submit: t.request,
              }}
            />
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * An existing request replaces the form entirely. Re-submitting is idempotent
 * server-side, but showing a live form next to an approved enrolment invites a
 * click that cannot do anything useful.
 */
function EnrollmentStatus({
  enrollment,
  locale,
  t,
  courseId,
}: {
  enrollment: Enrollment;
  locale: string;
  t: Ws3Messages["learn"]["enroll"];
  courseId: string;
}) {
  const explanations: Record<string, string> = {
    requested: t.statusRequested,
    approved: t.statusApproved,
    assigned: t.statusAssigned,
    rejected: t.statusRejected,
    cancelled: t.statusCancelled,
    completed: t.statusCompleted,
  };
  const canOpenCourse = enrollment.state === "assigned" || enrollment.state === "completed";

  return (
    <Card as="section">
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle>{t.statusTitle}</CardTitle>
        <StatusBadge state={enrollment.state} />
      </div>

      <p className="mt-2 max-w-[68ch] text-[15px] leading-6">
        {explanations[enrollment.state] ?? enrollment.state}
      </p>

      {enrollment.decision_reason && (
        <p className="mt-3 max-w-[68ch] text-[13px] leading-5 text-[--color-fg-muted]">
          <span className="font-semibold">{t.reason}:</span> {enrollment.decision_reason}
        </p>
      )}

      <p className="mt-3 tabular text-[13px] leading-5 text-[--color-fg-muted]">
        {formatDate(enrollment.decided_at ?? enrollment.created_at, locale)}
      </p>

      {canOpenCourse && (
        <div className="mt-4">
          <LinkButton href={`/${locale}/learn/courses/${courseId}`}>{t.toCourse}</LinkButton>
        </div>
      )}
    </Card>
  );
}
