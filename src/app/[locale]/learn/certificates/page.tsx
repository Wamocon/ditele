import { notFound } from "next/navigation";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { LearnerCertificateList } from "@/features/certification/components/learner-certificate-list";
import { isLocale } from "@/shared/i18n/config";

import { learnerCertificatesCopy } from "./copy";
import { readLearnerCertificateRecords } from "./data";

export default async function LearnerCertificatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(locale, `/${locale}/learn/certificates`, [
      "learner",
    ]))
  ) {
    return null;
  }

  const certificates = await readLearnerCertificateRecords(locale);
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <LearnerCertificateList
      certificates={certificates}
      formatDate={(value) => formatter.format(new Date(value))}
      labels={learnerCertificatesCopy[locale]}
    />
  );
}
