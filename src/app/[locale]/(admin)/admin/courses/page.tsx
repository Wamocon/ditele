import type { Route } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Button, EmptyState, ErrorState, statusLabel } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { listAdminCourses } from "@/shared/data/content";
import { countCourseEnrollments, countCourseTrainers } from "@/shared/data/assignment";
import { adminStrings } from "@/features/content/i18n";
import { ListFilters } from "@/features/content/components/list-filters";
import { Pager } from "@/features/content/components/pager";
import { CourseCard } from "@/features/content/components/course-card";
import type { RecordState } from "@/features/content/model";

const PAGE_SIZE = 20;
const COURSE_STATES: RecordState[] = ["draft", "active", "inactive", "archived"];

/**
 * The course list, as **cards two per row** (FEATURE_BUILD_PLAN §1.3).
 *
 * It was a DataTable of seven columns. The product owner asked for cards
 * showing "the course, how many users are on it, other course facts, and its
 * active / inactive state" — and the two figures that request turns on,
 * enrolled learners and assigned trainers, were the two the table did not have.
 *
 * Both counts are fetched once for the whole page rather than per card. Twenty
 * cards each asking their own question is twenty round trips for a number that
 * one `in (…)` answers.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { q, filter, page: pageParam } = await searchParams;
  await requireRole(["admin"], locale);

  const strings = adminStrings(locale);
  const s = strings.courses;
  const page = Math.max(1, Number(pageParam) || 1);

  const result = await listAdminCourses({
    locale,
    search: q ?? "",
    state: filter ?? "",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const header = (
    <PageHeader
      title={s.title}
      description={s.subtitle}
      actions={
        <Link href={`/${locale}/admin/courses/new` as Route}>
          <Button iconLeft={<Plus className="size-4" aria-hidden />}>{s.new}</Button>
        </Link>
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <ErrorState message={result.error.message} />
      </>
    );
  }

  const { rows, total } = result.data;
  const filtering = Boolean(q?.trim() || filter);
  const ids = rows.map((row) => row.id);

  // A count that fails to load must not take the page down with it: the cards
  // still say everything else useful, so a failed count degrades to zero rather
  // than to an error screen.
  const [learnerCounts, trainerCounts] = await Promise.all([
    countCourseEnrollments(ids),
    countCourseTrainers(ids),
  ]);
  const learners = learnerCounts.ok ? learnerCounts.data : new Map<string, number>();
  const trainers = trainerCounts.ok ? trainerCounts.data : new Map<string, number>();

  const cardLabels = {
    learners: s.cardLearners,
    trainers: s.cardTrainers,
    tasks: s.cardTasks,
    versions: s.cardVersions,
    duration: s.cardDuration,
    hours: s.cardHours,
    noDuration: s.cardNoDuration,
    open: s.openCourse,
    people: s.managePeople,
    duplicate: s.duplicate,
    duplicateSlugLabel: s.duplicateSlugLabel,
    duplicateSlugHint: s.duplicateSlugHint,
    duplicateSubmit: s.duplicateSubmit,
  };

  return (
    <>
      {header}

      <ListFilters
        basePath={`/${locale}/admin/courses`}
        searchLabel={s.search}
        searchValue={q ?? ""}
        filterLabel={s.filterState}
        filterValue={filter ?? ""}
        allLabel={strings.shared.filterAll}
        submitLabel={s.search}
        // `statusLabel` is the one DB-state → German mapping (WS-0). Never a second one.
        filterOptions={COURSE_STATES.map((value) => ({ value, label: statusLabel(value, locale) }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={filtering ? s.emptyFilteredTitle : s.emptyTitle}
          description={filtering ? s.emptyFilteredDescription : s.emptyDescription}
          action={
            filtering ? undefined : (
              <Link href={`/${locale}/admin/courses/new` as Route}>
                <Button>{s.new}</Button>
              </Link>
            )
          }
        />
      ) : (
        // Two per row, as asked. One per row below `md`, because two 4-stat
        // cards side by side on a phone truncate every figure they exist to show.
        <ul className="grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
          {rows.map((course) => (
            <li key={course.id}>
              <CourseCard
                locale={locale}
                course={course}
                learnerCount={learners.get(course.id) ?? 0}
                trainerCount={trainers.get(course.id) ?? 0}
                labels={cardLabels}
              />
            </li>
          ))}
        </ul>
      )}

      <Pager
        basePath={`/${locale}/admin/courses`}
        query={{ q, filter }}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        previousLabel={strings.shared.previous}
        nextLabel={strings.shared.next}
      />
    </>
  );
}
