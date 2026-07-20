"use client";

import { useParams } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import { learnerCertificatesCopy } from "./copy";

export default function LearnerCertificatesLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const copy = learnerCertificatesCopy[locale];
  return (
    <StatePanel
      description={copy.loadingDescription}
      title={copy.loadingTitle}
    />
  );
}
