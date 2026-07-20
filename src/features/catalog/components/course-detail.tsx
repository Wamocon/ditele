import Link from "next/link";
import type { Route } from "next";

import {
  localizedText,
  type CatalogCourseDetail,
  type CatalogLocale,
} from "../model/catalog";

interface CourseDetailProps {
  course: CatalogCourseDetail;
  locale: CatalogLocale;
  labels: CourseDetailLabels;
  enrollmentHref: Route;
  catalogHref: Route;
}

export interface CourseDetailLabels {
  backToCatalog: string;
  requestEnrollment: string;
  about: string;
  outcomes: string;
  availability: Record<CatalogCourseDetail["availability"], string>;
}

export function CourseDetail({
  course,
  locale,
  labels,
  enrollmentHref,
  catalogHref,
}: CourseDetailProps) {
  return (
    <article aria-labelledby="course-title" className="stack">
      <Link href={catalogHref}>{labels.backToCatalog}</Link>
      <header className="panel stack">
        <p className="muted">{labels.availability[course.availability]}</p>
        <h1 id="course-title">{localizedText(course.title, locale)}</h1>
        <p>{localizedText(course.summary, locale)}</p>
        <Link className="button" href={enrollmentHref}>{labels.requestEnrollment}</Link>
      </header>

      <section aria-labelledby="course-description" className="panel stack">
        <h2 id="course-description">{labels.about}</h2>
        <p>{localizedText(course.description, locale)}</p>
      </section>

      <section aria-labelledby="course-outcomes" className="panel stack">
        <h2 id="course-outcomes">{labels.outcomes}</h2>
        <ul>
          {course.learningOutcomes.map((outcome) => (
            <li key={outcome.en}>{localizedText(outcome, locale)}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
