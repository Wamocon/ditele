import Link from "next/link";
import type { Route } from "next";

import type {
  LearnerCourseSummary,
  LearnerDashboard as LearnerDashboardModel,
} from "../model/learner-dashboard";
import styles from "./learner-dashboard.module.css";

function CourseList({
  courses,
  heading,
  emptyDescription,
  progressionLabels,
  progressLabel,
  courseHref,
  linkCourses,
  sectionId,
  statusDescription,
}: {
  courses: LearnerCourseSummary[];
  heading: string;
  emptyDescription: string;
  progressionLabels: LearnerDashboardLabels["progression"];
  progressLabel(completed: number, total: number): string;
  courseHref(course: LearnerCourseSummary): Route;
  linkCourses: boolean;
  sectionId: string;
  statusDescription?: string;
}) {
  return (
    <section aria-labelledby={sectionId} className="stack">
      <h2 id={sectionId}>{heading}</h2>
      {courses.length === 0 ? (
        <p className="muted">{emptyDescription}</p>
      ) : (
        <ul className={`stack ${styles.courseList}`}>
          {courses.map((course) => (
            <li key={course.id}>
              <article className={`panel stack ${styles.courseCard}`}>
                <h3>
                  {linkCourses ? (
                    <Link href={courseHref(course)}>{course.title}</Link>
                  ) : course.title}
                </h3>
                {linkCourses ? (
                  <>
                    <p className="muted">
                      {progressionLabels[course.progressionMode]}
                    </p>
                    <progress
                      aria-label={`${course.title}: ${progressLabel(course.completedActivities, course.totalActivities)}`}
                      max={Math.max(course.totalActivities, 1)}
                      value={course.completedActivities}
                    />
                    <span>{progressLabel(course.completedActivities, course.totalActivities)}</span>
                  </>
                ) : (
                  <p className="muted" role="status">{statusDescription}</p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface LearnerDashboardProps {
  dashboard: LearnerDashboardModel;
  labels: LearnerDashboardLabels;
  courseHref(course: LearnerCourseSummary): Route;
  nextActionHref(action: NonNullable<LearnerDashboardModel["nextAction"]>): Route;
}

export interface LearnerDashboardLabels {
  heading: string;
  nextAction: string;
  continueLearning: string;
  noAction: string;
  activeCourses: string;
  completedCourses: string;
  requestedCourses: string;
  awaitingAssignment: string;
  emptySection: string;
  progression: Record<LearnerCourseSummary["progressionMode"], string>;
  progress(completed: number, total: number): string;
}

export function LearnerDashboard({ dashboard, labels, courseHref, nextActionHref }: LearnerDashboardProps) {
  return (
    <div className="stack">
      <header className="stack">
        <h1>{labels.heading}</h1>
      </header>

      <section aria-labelledby="next-learning-action" className={`panel stack ${styles.nextAction}`}>
        <h2 id="next-learning-action">{labels.nextAction}</h2>
        {dashboard.nextAction ? (
          <article>
            <p>{dashboard.nextAction.reason}</p>
            <h3>{dashboard.nextAction.title}</h3>
            <Link className="button" href={nextActionHref(dashboard.nextAction)}>{labels.continueLearning}</Link>
          </article>
        ) : (
          <p className="muted" role="status">{labels.noAction}</p>
        )}
      </section>

      <CourseList courses={dashboard.activeCourses} courseHref={courseHref} emptyDescription={labels.emptySection} heading={labels.activeCourses} linkCourses progressLabel={labels.progress} progressionLabels={labels.progression} sectionId="active-course-list" />
      <CourseList courses={dashboard.completedCourses} courseHref={courseHref} emptyDescription={labels.emptySection} heading={labels.completedCourses} linkCourses progressLabel={labels.progress} progressionLabels={labels.progression} sectionId="completed-course-list" />
      <CourseList courses={dashboard.requestedCourses} courseHref={courseHref} emptyDescription={labels.emptySection} heading={labels.requestedCourses} linkCourses={false} progressLabel={labels.progress} progressionLabels={labels.progression} sectionId="requested-course-list" statusDescription={labels.awaitingAssignment} />
    </div>
  );
}
