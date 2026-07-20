"use client";

import { useParams } from "next/navigation";

import { questionWorkflowCopy } from "@/features/mentoring/question-workflow-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function TrainerQuestionsLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const copy = questionWorkflowCopy[locale].common;
  return (
    <StatePanel
      description={copy.loadingDescription}
      title={copy.loadingTitle}
    />
  );
}

