import { notFound } from "next/navigation";

import { LearnerDashboard } from "@/features/learning/components/learner-dashboard";
import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";

import { learnerDashboardCopy } from "./copy";
import { readLearnerDashboard } from "./data";

export default async function LearnerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await canRenderProtectedPage(locale, `/${locale}/learn`, ["learner"]))) {
    return null;
  }
  const dashboard = await readLearnerDashboard(locale);

  return (
    <LearnerDashboard
      courseHref={(course) =>
        localizedDynamicRoute(locale, `/learn/courses/${course.courseId}`)
      }
      dashboard={dashboard}
      labels={learnerDashboardCopy[locale]}
      nextActionHref={(action) => localizedDynamicRoute(locale, action.href as `/${string}`)}
    />
  );
}
