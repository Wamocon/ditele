"use client";

import { useParams } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { StatePanel } from "@/shared/ui/state-panel";

import { learnerPortfolioCopy } from "./copy";

export default function LearnerPortfolioError({ reset }: { reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const copy = learnerPortfolioCopy[locale];
  return (
    <StatePanel
      action={<Button onClick={reset}>{copy.retry}</Button>}
      description={copy.errorDescription}
      title={copy.errorTitle}
      tone="danger"
    />
  );
}
