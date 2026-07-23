import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { ErrorState } from "@/shared/ui";
import { listMyArena } from "@/shared/data/learning";
import { ArenaView } from "@/features/learning/arena-view";

export const metadata: Metadata = { title: "Arena · DiTeLe" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const result = await listMyArena();

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Arena" locale={locale} />
        <ErrorState error={result.error} locale={locale} />
      </>
    );
  }

  return <ArenaView locale={locale} data={result.data} />;
}
