import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, Card, CardTitle, CardDescription, ErrorState } from "@/shared/ui";
import { getActiveCourseBySlug } from "@/shared/data/catalog";
import { getOptionalPrincipal } from "@/shared/auth/guard";

const BREADCRUMB = "Kurse";

/** Plain-text description → paragraphs on blank lines. No HTML on the clean schema. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter((block) => block.length > 0);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getActiveCourseBySlug(slug);
  if (!result.ok) return { title: "Kurs nicht gefunden · DiTeLe" };
  return {
    title: `${result.data.title} · DiTeLe`,
    description: result.data.description.slice(0, 160),
  };
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  const [result, session] = await Promise.all([
    getActiveCourseBySlug(slug),
    getOptionalPrincipal(),
  ]);

  if (!result.ok) {
    // An unknown or non-active slug comes back as PGRST116 — that is a 404, not
    // a failure. Everything else is a real error worth showing.
    if (result.error.code === "PGRST116") notFound();
    return (
      <>
        <PageHeader title="Kurs nicht verfügbar" />
        <ErrorState
          title="Kurs konnte nicht geladen werden"
          message="Bitte laden Sie die Seite neu oder versuchen Sie es später erneut."
        />
      </>
    );
  }

  const course = result.data;
  const blocks = paragraphs(course.description);

  return (
    <>
      <PageHeader
        title={course.title}
        breadcrumbs={[{ label: BREADCRUMB, href: `/${locale}/catalog` }, { label: course.title }]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex flex-col gap-6">
          {course.cover_image_url && (
            <div className="aspect-video w-full overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-2)">
              {/* Arbitrary remote host → plain <img> avoids next/image's per-domain
                  allowlist in next.config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={course.cover_image_url}
                alt={course.title}
                className="size-full object-cover"
              />
            </div>
          )}

          <section>
            <h2 className="mb-2 text-[22px] font-semibold leading-7">Über diesen Kurs</h2>
            {blocks.length > 0 ? (
              <div className="prose-measure flex flex-col gap-3">
                {blocks.map((block, index) => (
                  <p key={index} className="text-[15px] leading-6 text-(--color-fg-muted)">
                    {block}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[15px] leading-6 text-(--color-fg-muted)">
                Für diesen Kurs liegt noch keine Beschreibung vor.
              </p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-height)+16px)] lg:self-start">
          {/* No enrol button: on the clean schema enrolment is admin-only. */}
          <Card className="flex flex-col gap-3">
            <span className="flex size-10 items-center justify-center rounded-(--radius-md) bg-(--color-brand-soft) text-(--color-brand)">
              <Info className="size-5" aria-hidden />
            </span>
            <CardTitle>Zugang zu diesem Kurs</CardTitle>
            <CardDescription className="text-[15px] leading-6">
              Kurse werden von der Administration zugewiesen. Eine Selbst-Einschreibung gibt es nicht.
              Wende dich an deine Trainerin, deinen Trainer oder die Administration, wenn du diesen
              Kurs belegen möchtest.
            </CardDescription>

            {session === null && (
              <Link href={`/${locale}/login` as Route} className="mt-1">
                <Button fullWidth variant="outline">
                  Anmelden
                </Button>
              </Link>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
