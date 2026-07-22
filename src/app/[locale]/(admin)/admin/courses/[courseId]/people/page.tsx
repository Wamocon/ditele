import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getAdminCourse } from "@/shared/data/content";
import { getCourseAssignments } from "@/shared/data/assignment";
import { adminStrings } from "@/features/content/i18n";
import {
  LearnerPanel,
  TrainerPanel,
  type PeopleLabels,
} from "@/features/content/components/assignment-panels";

/**
 * The assignment screen — FEATURE_BUILD_PLAN §1.5.
 *
 * Everything on it was impossible before Phase 1b: the domain tables answer
 * 42501 to a direct write, and there were no commands for any of the six
 * actions. The admin's only route to a learner was to wait for that learner to
 * request the course and then approve the request.
 *
 * Three relationships on one screen because they are one job — "put these people
 * on this course, and say who looks after whom" — even though they land in three
 * different tables for the reasons recorded in `20260729100000`.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  await requireRole(["admin"], locale);

  const strings = adminStrings(locale);
  const p = strings.people;

  const [course, assignments] = await Promise.all([
    getAdminCourse(courseId),
    getCourseAssignments(courseId),
  ]);

  // AdminCourseDetail carries localizations rather than a resolved title, so
  // the title is picked here with the same fallback chain the rest of the studio
  // uses: the requested locale, then German, then the slug.
  const courseTitle = course.ok
    ? course.data.localizations.find((row) => row.locale === locale)?.title ??
      course.data.localizations.find((row) => row.locale === "de")?.title ??
      course.data.slug
    : "";

  const header = (
    <PageHeader
      title={p.title}
      description={courseTitle ? `${courseTitle} — ${p.subtitle}` : p.subtitle}
      actions={
        <Link href={`/${locale}/admin/courses` as Route}>
          <Button variant="ghost" iconLeft={<ArrowLeft className="size-4" aria-hidden />}>
            {p.backToCourses}
          </Button>
        </Link>
      }
    />
  );

  if (!assignments.ok) {
    return (
      <>
        {header}
        <ErrorState message={assignments.error.message} />
      </>
    );
  }

  const labels: PeopleLabels = {
    learnersHeading: p.learnersHeading,
    learnersDescription: p.learnersDescription,
    trainersHeading: p.trainersHeading,
    trainersDescription: p.trainersDescription,
    mentorsHeading: p.mentorsHeading,
    mentorsDescription: p.mentorsDescription,
    addLearner: p.addLearner,
    addTrainer: p.addTrainer,
    selectPerson: p.selectPerson,
    add: p.add,
    remove: p.remove,
    assignMentor: p.assignMentor,
    noLearners: p.noLearners,
    noTrainers: p.noTrainers,
    noCandidates: p.noCandidates,
    noMentors: p.noMentors,
  };

  const { learners, trainers, candidateLearners, candidateTrainers } = assignments.data;

  // Someone already assigned as a course trainer is still a valid mentor for an
  // individual learner, so the mentor picker offers every trainer rather than
  // only the unassigned ones.
  const everyTrainer = [...trainers, ...candidateTrainers].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  return (
    <>
      {header}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LearnerPanel
          locale={locale}
          courseId={courseId}
          learners={learners}
          candidates={candidateLearners}
          trainerCandidates={everyTrainer}
          labels={labels}
        />
        <TrainerPanel
          locale={locale}
          courseId={courseId}
          trainers={trainers}
          candidates={candidateTrainers}
          labels={labels}
        />
      </div>
    </>
  );
}
