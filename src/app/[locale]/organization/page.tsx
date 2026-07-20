import { notFound } from "next/navigation";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import { organizationWorkspaceCopy } from "./copy";

export default async function OrganizationPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/organization`,
      ["organization_admin"],
    ))
  ) {
    return null;
  }

  const labels = organizationWorkspaceCopy[locale];
  return (
    <section className="stack" aria-labelledby="organization-title">
      <header className="page-heading">
        <p className="eyebrow">{labels.status}</p>
        <h1 id="organization-title">{labels.title}</h1>
        <p>{labels.summary}</p>
      </header>
      <StatePanel
        description={labels.blockedDescription}
        title={labels.blockedTitle}
      />
    </section>
  );
}
