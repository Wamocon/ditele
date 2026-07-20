import { CourseCatalog } from "@/features/catalog/components/course-catalog";
import { listCatalog } from "@/features/catalog/server/catalog-service";
import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedDynamicRoute } from "@/shared/i18n/routes";
import { PublicHeader } from "@/shared/ui/public-header";
import { notFound } from "next/navigation";

import { listPublishedCatalog } from "./_data/catalog-repository";
import { catalogCopy } from "./copy";

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  const [messages, catalog] = await Promise.all([
    getMessages(locale),
    listCatalog(
      {
        list: listPublishedCatalog,
        getBySlug: async () => {
          throw new Error("catalog.unused_repository_method");
        },
      },
      { locale, search: query.search ?? "", page: 1, pageSize: 12 },
    ),
  ]);

  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main className="content-section" id="main-content">
        <div className="container reading-column">
          <CourseCatalog
            catalog={catalog}
            courseHref={(slug) => localizedDynamicRoute(locale, `/catalog/${slug}`)}
            labels={catalogCopy[locale].catalog}
            locale={locale}
            search={query.search ?? ""}
          />
        </div>
      </main>
    </>
  );
}
