import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { getDict } from "../_lib/i18n";
import { ProseSection, PendingDataNotice } from "../_components/static-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.public.legal.title} · DiTeLe`, description: dict.public.legal.lead };
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale).public.legal;

  const sections = [
    { title: t.s1Title, body: t.s1Body },
    { title: t.s2Title, body: t.s2Body },
    { title: t.s3Title, body: t.s3Body },
    { title: t.s4Title, body: t.s4Body },
    { title: t.s5Title, body: t.s5Body },
    { title: t.s6Title, body: t.s6Body },
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.lead} />

      <div className="flex flex-col gap-8">
        {/* Visible on purpose — inventing Pflichtangaben would be worse (I-019). */}
        <PendingDataNotice>{t.pendingNotice}</PendingDataNotice>

        {sections.map((section) => (
          <ProseSection key={section.title} title={section.title}>
            <p>{section.body}</p>
          </ProseSection>
        ))}
      </div>
    </>
  );
}
