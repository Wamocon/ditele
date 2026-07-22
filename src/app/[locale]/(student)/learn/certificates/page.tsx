import { Award } from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Card, DataTable, EmptyState, ErrorState, StatusBadge, type Column } from "@/shared/ui";
import { listMyCertificates, type Certificate } from "@/shared/data/profile";
import { LinkButton } from "@/features/questions/components/link-button";
import { getWs3Messages } from "@/features/questions/i18n";
import { formatDate } from "@/features/questions/format";

const PAGE_SIZE = 25;

/**
 * Certificates are P1 and blocked (MASTER_PLAN §10 F61 / BLK-003): the table
 * exists, nothing writes to it, and no RPC issues a certificate. So the honest
 * state today is "none yet, and here is why" — not a fake list.
 *
 * The table below is still real: the moment rows appear, they render. Only the
 * download stays disabled, because `media_asset_id` has no delivery route yet.
 */
export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.certificates;

  const result = await listMyCertificates({ limit: PAGE_SIZE });

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <ErrorState title={messages.learn.shared.loadErrorTitle} error={result.error} locale={locale} />
      </>
    );
  }

  const { items } = result.data;

  if (items.length === 0) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          icon={<Award className="size-6 text-(--color-fg-subtle)" aria-hidden />}
          action={
            <LinkButton href={`/${locale}/learn/courses`} variant="outline">
              {messages.nav.courses}
            </LinkButton>
          }
        />
        <Card className="mt-6 border-dashed">
          <p className="text-[15px] font-semibold leading-6">{t.notReleasedTitle}</p>
          <p className="mt-1 max-w-[68ch] text-[13px] leading-5 text-(--color-fg-muted)">
            {t.notReleasedDescription}
          </p>
        </Card>
      </>
    );
  }

  const columns: Column<Certificate>[] = [
    {
      key: "type",
      header: t.columnType,
      cell: (row) => <span className="font-semibold">{row.certificate_type}</span>,
    },
    {
      key: "state",
      header: t.columnState,
      cell: (row) => <StatusBadge state={row.state} locale={locale} />,
    },
    {
      key: "issued",
      header: t.columnIssued,
      numeric: true,
      cell: (row) => formatDate(row.issued_at, locale),
    },
    {
      key: "download",
      header: t.download,
      cell: (row) => (
        // No delivery route exists for `media_asset_id` yet, so the action is
        // shown as unavailable rather than as a link that 404s.
        <span className="text-[13px] text-(--color-fg-muted)">
          {row.media_asset_id ? t.downloadUnavailable : "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <DataTable columns={columns} rows={items} rowKey={(row) => row.id} caption={t.title} />
    </>
  );
}
