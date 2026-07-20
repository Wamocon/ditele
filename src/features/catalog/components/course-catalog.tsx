import Link from "next/link";
import type { Route } from "next";

import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/field";
import { StatePanel } from "@/shared/ui/state-panel";

import {
  localizedText,
  type CatalogLocale,
  type CatalogPage,
} from "../model/catalog";
import styles from "./course-catalog.module.css";

interface CourseCatalogProps {
  catalog: CatalogPage;
  locale: CatalogLocale;
  labels: CourseCatalogLabels;
  search?: string;
  courseHref(courseSlug: string): Route;
}

export interface CourseCatalogLabels {
  heading: string;
  introduction: string;
  searchLabel: string;
  searchButton: string;
  emptyTitle: string;
  emptyDescription: string;
  duration: string;
  practicalTasks: string;
  durationValue(minutes: number): string;
  taskCountValue(count: number): string;
  availability: Record<CatalogPage["items"][number]["availability"], string>;
}

export function CourseCatalog({
  catalog,
  locale,
  labels,
  search = "",
  courseHref,
}: CourseCatalogProps) {
  return (
    <section aria-labelledby="catalog-heading" className="stack">
      <header className="stack">
        <h1 id="catalog-heading">{labels.heading}</h1>
        <p className="muted">{labels.introduction}</p>
      </header>

      <form className="cluster" method="get" role="search">
        <Field htmlFor="catalog-search" label={labels.searchLabel}>
          <Input
            defaultValue={search}
            id="catalog-search"
            maxLength={120}
            name="search"
            type="search"
          />
        </Field>
        <Button type="submit">{labels.searchButton}</Button>
      </form>

      {catalog.items.length === 0 ? (
        <StatePanel description={labels.emptyDescription} title={labels.emptyTitle} />
      ) : (
        <ul aria-label={labels.heading} className={`stack ${styles.list}`}>
          {catalog.items.map((course) => (
            <li key={course.id}>
              <article className={`panel stack ${styles.card}`}>
                <p className="muted">{labels.availability[course.availability]}</p>
                <h2>
                  <Link href={courseHref(course.slug)}>
                    {localizedText(course.title, locale)}
                  </Link>
                </h2>
                <p>{localizedText(course.summary, locale)}</p>
                <dl className={styles.facts}>
                  <div>
                    <dt>{labels.duration}</dt>
                    <dd>{labels.durationValue(course.durationMinutes)}</dd>
                  </div>
                  <div>
                    <dt>{labels.practicalTasks}</dt>
                    <dd>{labels.taskCountValue(course.taskCount)}</dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
