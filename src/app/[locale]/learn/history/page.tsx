import { notFound } from "next/navigation";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { LearnerHistoryView } from "@/features/learning/components/learner-history-view";
import { learnerHistoryCopy } from "@/features/learning/learner-history-copy";
import { LearnerHistoryPageNumberSchema } from "@/features/learning/model/learner-history";
import {
  readLearnerHistory,
  resolveLearnerHistorySnapshot,
} from "@/features/learning/server/learner-history-data";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import {
  localizedDynamicRoute,
  localizedRoute,
} from "@/shared/i18n/routes";
import { StatePanel } from "@/shared/ui/state-panel";

export default async function LearnerHistoryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{
    page?: string | string[];
    snapshot?: string | string[];
  }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/learn/history`,
      ["learner"],
    ))
  ) {
    return null;
  }

  if (
    (query.page !== undefined && typeof query.page !== "string") ||
    (query.snapshot !== undefined && typeof query.snapshot !== "string")
  ) {
    notFound();
  }
  const parsedPage = LearnerHistoryPageNumberSchema.safeParse(
    query.page === undefined ? 1 : Number(query.page),
  );
  if (!parsedPage.success) notFound();
  const page = parsedPage.data;
  const snapshotInput = query.snapshot;
  if (page > 1 && snapshotInput === undefined) notFound();
  let snapshotAt: string;
  try {
    snapshotAt = resolveLearnerHistorySnapshot(snapshotInput);
  } catch {
    notFound();
  }

  const principal = await getPrincipal();
  const labels = learnerHistoryCopy[locale];
  if (
    principal.organizationId === null ||
    !hasPermission(principal, "cohort.read")
  ) {
    return (
      <StatePanel
        description={labels.forbiddenDescription}
        title={labels.forbiddenTitle}
        tone="danger"
      />
    );
  }

  const history = await readLearnerHistory(
    principal,
    locale,
    page,
    snapshotAt,
  );
  if (page > 1 && history.items.length === 0) notFound();
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <LearnerHistoryView
      formatDateTime={(value) => formatter.format(new Date(value))}
      history={history}
      labels={labels}
      pageHref={(targetPage, snapshot) =>
        localizedDynamicRoute(
          locale,
          `/learn/history?page=${targetPage}&snapshot=${encodeURIComponent(snapshot)}`,
        )
      }
      targetHref={(target) => {
        if (target.type === "course") {
          return localizedDynamicRoute(
            locale,
            `/learn/courses/${target.id}`,
          );
        }
        if (target.type === "question") {
          return localizedDynamicRoute(
            locale,
            `/learn/questions/${target.id}`,
          );
        }
        return localizedRoute(locale, "/learn/certificates");
      }}
    />
  );
}
