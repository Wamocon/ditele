"use client";

import { useParams } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import { learnerSkillsCopy } from "./copy";

export default function LearnerSkillsLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const copy = learnerSkillsCopy[locale];
  return (
    <StatePanel
      description={copy.loadingDescription}
      title={copy.loadingTitle}
    />
  );
}
