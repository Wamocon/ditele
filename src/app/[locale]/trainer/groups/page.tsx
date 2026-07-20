import { notFound } from "next/navigation";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { TrainerGroupsView } from "@/features/cohorts/components/trainer-groups-view";
import { readTrainerGroups } from "@/features/cohorts/server/trainer-read-data";
import { trainerGroupsCopy } from "@/features/cohorts/trainer-read-copy";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default async function TrainerGroupsPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/groups`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }

  const principal = await getPrincipal();
  const labels = trainerGroupsCopy[locale];
  if (!hasPermission(principal, "cohort.read")) {
    return (
      <StatePanel
        description={labels.forbiddenDescription}
        title={labels.forbiddenTitle}
        tone="danger"
      />
    );
  }

  const groups = await readTrainerGroups(principal, locale);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <TrainerGroupsView
      formatDateTime={(value) => formatter.format(new Date(value))}
      groups={groups}
      labels={labels}
      locale={locale}
    />
  );
}
