import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { Notification } from "../model";

interface NotificationListLabels {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  unread: string;
  resolveTitle(key: string): string;
}

export function NotificationList({
  notifications,
  labels,
}: {
  notifications: readonly Notification[];
  labels: NotificationListLabels;
}) {
  if (notifications.length === 0) {
    return (
      <StatePanel
        description={labels.emptyDescription}
        title={labels.emptyTitle}
      />
    );
  }

  return (
    <section aria-labelledby="notification-title" className="stack">
      <h2 id="notification-title">{labels.title}</h2>
      <ul className="stack">
        {notifications.map((notification) => (
          <li className="panel stack" key={notification.id}>
            <span>{labels.resolveTitle(notification.titleKey)}</span>
            {notification.readAt ? null : (
              <Badge tone="warning">{labels.unread}</Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
