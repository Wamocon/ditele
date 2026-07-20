import { CourseDetail } from "@/features/catalog/components/course-detail";
import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";
import { PublicHeader } from "@/shared/ui/public-header";
import { notFound } from "next/navigation";

import { getPublishedCatalogCourse } from "../_data/catalog-repository";
import { catalogCopy } from "../copy";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();

  const [messages, course] = await Promise.all([
    getMessages(locale),
    getPublishedCatalogCourse(slug),
  ]);
  if (!course) notFound();

  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main className="content-section" id="main-content">
        <div className="container reading-column">
          <CourseDetail
            catalogHref={localizedRoute(locale, "/catalog")}
            course={course}
            enrollmentHref={localizedDynamicRoute(
              locale,
              `/learn/enroll/${course.id}`,
            )}
            labels={catalogCopy[locale].detail}
            locale={locale}
          />
        </div>
      </main>
    </>
  );
}
