import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { Card, CardTitle, CardDescription } from "@/shared/ui";
import { getDict } from "../_lib/i18n";
import { ProseSection } from "../_components/static-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `${dict.public.about.title} · DiTeLe`, description: dict.public.about.lead };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale).public.about;

  const approach = [
    { title: t.approach1Title, body: t.approach1Body },
    { title: t.approach2Title, body: t.approach2Body },
    { title: t.approach3Title, body: t.approach3Body },
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.lead} />

      <div className="flex flex-col gap-8">
        <ProseSection title={t.missionTitle}>
          <p>{t.missionBody}</p>
        </ProseSection>

        <section className="flex flex-col gap-3">
          <h2 className="text-[22px] font-semibold leading-7">{t.approachTitle}</h2>
          <div className="grid gap-4 md:grid-cols-3 lg:gap-5">
            {approach.map((item) => (
              <Card key={item.title} className="flex flex-col gap-2">
                <CardTitle>{item.title}</CardTitle>
                <CardDescription className="text-[15px] leading-6">{item.body}</CardDescription>
              </Card>
            ))}
          </div>
        </section>

        <ProseSection title={t.audienceTitle}>
          <p>{t.audienceBody}</p>
        </ProseSection>

        <ProseSection title={t.contactTitle}>
          <p>{t.contactBody}</p>
        </ProseSection>
      </div>
    </>
  );
}
