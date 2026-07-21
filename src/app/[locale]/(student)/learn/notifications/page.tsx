import type { Route } from "next";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  MessageCircle,
  Send,
  Users,
} from "lucide-react";
import { PageHeader } from "@/shared/layout";
import { Badge, Card, EmptyState, ErrorState } from "@/shared/ui";
import { listMyNotifications, type Notification } from "@/shared/data/notifications";
import { format, getWs3Messages, type Ws3Messages } from "@/features/questions/i18n";
import { dayBucket, formatDateTime, formatTime, type DayBucket } from "@/features/questions/format";
import { MarkAllReadForm, MarkReadForm } from "./notification-forms";

const PAGE_SIZE = 50;

/**
 * One icon per event family. Written as a switch rather than a lookup table so
 * no component is constructed during render (`react-hooks/static-components`).
 * Status is never communicated by colour alone — icon plus label, always.
 */
function NotificationIcon({ eventType }: { eventType: string }) {
  const className = "size-4";
  switch (eventType.split(".")[0]) {
    case "enrollment":
      return <GraduationCap className={className} />;
    case "question":
      return <MessageCircle className={className} />;
    case "review":
      return <ClipboardCheck className={className} />;
    case "submission":
      return <Send className={className} />;
    case "cohort":
      return <Users className={className} />;
    case "task_schedule":
      return <CalendarClock className={className} />;
    default:
      return <Bell className={className} />;
  }
}

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page } = await searchParams;
  const messages = await getWs3Messages(locale);
  const t = messages.learn.notifications;

  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const result = await listMyNotifications({
    limit: PAGE_SIZE,
    offset: (pageNumber - 1) * PAGE_SIZE,
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <ErrorState title={messages.learn.shared.loadErrorTitle} message={result.error.message} />
      </>
    );
  }

  const { items, total, unread } = result.data;

  const buckets: { key: DayBucket; label: string; items: Notification[] }[] = [
    { key: "today", label: t.groupToday, items: [] },
    { key: "yesterday", label: t.groupYesterday, items: [] },
    { key: "earlier", label: t.groupEarlier, items: [] },
  ];
  for (const item of items) {
    buckets.find((bucket) => bucket.key === dayBucket(item.created_at))?.items.push(item);
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/${locale}/learn/notifications`;

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          unread > 0 ? (
            <MarkAllReadForm locale={locale} label={t.markAllRead} />
          ) : (
            <Badge tone="success" dot>
              {t.allRead}
            </Badge>
          )
        }
      />

      {unread > 0 && (
        <p className="mb-4 text-[13px] leading-5 text-[--color-fg-muted]">
          {format(t.unreadCount, { count: unread })}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          icon={<Bell className="size-6 text-[--color-fg-subtle]" aria-hidden />}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {buckets
            .filter((bucket) => bucket.items.length > 0)
            .map((bucket) => (
              <section key={bucket.key} aria-labelledby={`notification-group-${bucket.key}`}>
                <h2
                  id={`notification-group-${bucket.key}`}
                  className="mb-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[--color-fg-muted]"
                >
                  {bucket.label}
                </h2>
                <ul className="flex flex-col gap-3">
                  {bucket.items.map((item, index) => (
                    <li
                      key={item.id}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
                    >
                      <NotificationCard
                        item={item}
                        locale={locale}
                        messages={messages}
                        bucket={bucket.key}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      {lastPage > 1 && (
        <nav className="mt-8 flex items-center justify-between gap-3" aria-label={t.title}>
          {pageNumber > 1 ? (
            <Link
              href={`${base}?page=${pageNumber - 1}` as Route}
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[--color-brand] hover:underline"
            >
              {messages.common.back}
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular text-[13px] text-[--color-fg-muted]">
            {pageNumber} / {lastPage}
          </span>
          {pageNumber < lastPage ? (
            <Link
              href={`${base}?page=${pageNumber + 1}` as Route}
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[--color-brand] hover:underline"
            >
              {messages.common.continue}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

function NotificationCard({
  item,
  locale,
  messages,
  bucket,
}: {
  item: Notification;
  locale: string;
  messages: Ws3Messages;
  bucket: DayBucket;
}) {
  const t = messages.learn.notifications;
  const titles: Record<string, string> = t.events;
  const title = titles[item.event_type] ?? t.events.fallback;

  const link = item.questionId
    ? { href: `/${locale}/learn/questions/${item.questionId}`, label: t.openQuestion }
    : item.taskId
      ? { href: `/${locale}/learn/tasks/${item.taskId}`, label: t.openTask }
      : item.courseId
        ? { href: `/${locale}/learn/courses/${item.courseId}`, label: t.openCourse }
        : null;

  return (
    <Card className={item.isUnread ? "border-[--color-brand] bg-[--color-brand-soft]" : undefined}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[--color-surface-2] text-[--color-fg-muted]"
          aria-hidden
        >
          <NotificationIcon eventType={item.event_type} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold leading-6">{title}</p>
            {item.isUnread && (
              <Badge tone="brand" dot>
                {t.unread}
              </Badge>
            )}
          </div>
          <p className="tabular text-[13px] leading-5 text-[--color-fg-muted]">
            {bucket === "earlier"
              ? formatDateTime(item.created_at, locale)
              : formatTime(item.created_at, locale)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {link && (
              <Link
                href={link.href as Route}
                className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[--color-brand] hover:underline"
              >
                {link.label}
              </Link>
            )}
            {item.isUnread && (
              <MarkReadForm locale={locale} notificationId={item.id} label={t.markRead} />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
