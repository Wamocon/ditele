"use client";

import { useParams } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";

import { adminContentCopy } from "./copy";
import styles from "./content-studio.module.css";

export default function AdminCoursesLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  return (
    <section className="stack" aria-busy="true" aria-live="polite">
      <h1>{adminContentCopy[locale].loading}</h1>
      <div className={styles.courseList} aria-hidden="true">
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    </section>
  );
}
