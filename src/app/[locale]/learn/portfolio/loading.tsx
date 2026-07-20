"use client";

import { useParams } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import { learnerPortfolioCopy } from "./copy";

export default function LearnerPortfolioLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const copy = learnerPortfolioCopy[locale];
  return (
    <StatePanel
      description={copy.loadingDescription}
      title={copy.loadingTitle}
    />
  );
}
