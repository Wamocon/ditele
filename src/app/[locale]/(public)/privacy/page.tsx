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
  return { title: `${dict.public.privacy.title} · DiTeLe`, description: dict.public.privacy.lead };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale).public.privacy;

  const sections = [
    { title: t.s1Title, body: t.s1Body },
    { title: t.s2Title, body: t.s2Body },
    { title: t.s3Title, body: t.s3Body },
    { title: t.s4Title, body: t.s4Body },
    { title: t.s5Title, body: t.s5Body },
    { title: t.s6Title, body: t.s6Body },
    { title: t.s7Title, body: t.s7Body },
    { title: t.s8Title, body: t.s8Body },
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.lead} />

      <div className="flex flex-col gap-8">
        {/* Visible on purpose — see I-019. */}
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
