"use client";

import { useParams } from "next/navigation";

import { questionWorkflowCopy } from "@/features/mentoring/question-workflow-copy";
import { isLocale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { StatePanel } from "@/shared/ui/state-panel";

export default function LearnerQuestionsError({ reset }: { reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const copy = questionWorkflowCopy[locale].common;
  return (
    <StatePanel
      action={<Button onClick={reset}>{copy.retry}</Button>}
      description={copy.errorDescription}
      title={copy.errorTitle}
      tone="danger"
    />
  );
}
