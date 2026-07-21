import { Badge, type BadgeProps } from "./badge";

type Tone = NonNullable<BadgeProps["tone"]>;

/**
 * The ONE mapping from a database state to a tone + German label.
 * Every screen imports this. Never write a second mapping, and never invent a
 * state name — these keys come from the enums in database.types.ts, recorded in
 * plan/status/RPC_CONTRACTS.md §1.
 */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  // attempt_state
  in_progress:       { label: "In Bearbeitung",        tone: "info" },
  submitted:         { label: "Eingereicht",           tone: "info" },
  revision_required: { label: "Überarbeitung nötig",   tone: "warning" },
  resubmitted:       { label: "Erneut eingereicht",    tone: "info" },
  accepted:          { label: "Angenommen",            tone: "success" },
  abandoned:         { label: "Abgebrochen",           tone: "neutral" },
  withdrawn:         { label: "Zurückgezogen",         tone: "neutral" },

  // review_decision
  transferred:       { label: "Weitergegeben",         tone: "info" },

  // enrollment_state
  requested:         { label: "Angefragt",             tone: "warning" },
  approved:          { label: "Genehmigt",             tone: "success" },
  rejected:          { label: "Abgelehnt",             tone: "danger" },
  assigned:          { label: "Zugeteilt",             tone: "success" },
  cancelled:         { label: "Storniert",             tone: "neutral" },
  completed:         { label: "Abgeschlossen",         tone: "success" },

  // cohort_state
  waiting:           { label: "Wartend",               tone: "neutral" },
  active:            { label: "Aktiv",                 tone: "success" },

  // content_version_state
  draft:             { label: "Entwurf",               tone: "neutral" },
  in_review:         { label: "In Prüfung",            tone: "warning" },
  published:         { label: "Veröffentlicht",        tone: "success" },
  archived:          { label: "Archiviert",            tone: "neutral" },

  // question_state
  open:              { label: "Offen",                 tone: "warning" },
  answered:          { label: "Beantwortet",           tone: "success" },

  // notification_state
  pending:           { label: "Ausstehend",            tone: "neutral" },
  delivered:         { label: "Zugestellt",            tone: "info" },
  read:              { label: "Gelesen",               tone: "neutral" },
  failed:            { label: "Fehlgeschlagen",        tone: "danger" },

  // membership_state / certificate_state / record_state
  invited:           { label: "Eingeladen",            tone: "info" },
  suspended:         { label: "Ausgesetzt",            tone: "warning" },
  removed:           { label: "Entfernt",              tone: "neutral" },
  inactive:          { label: "Inaktiv",               tone: "neutral" },
  eligible:          { label: "Berechtigt",            tone: "info" },
  issued:            { label: "Ausgestellt",           tone: "success" },
  available:         { label: "Verfügbar",             tone: "success" },
  revoked:           { label: "Widerrufen",            tone: "danger" },
  expired:           { label: "Abgelaufen",            tone: "neutral" },
  processing:        { label: "In Bearbeitung",        tone: "info" },
};

/**
 * The same states in the other interface languages.
 *
 * Kept beside the tone map rather than in messages/*.json so the tone and the
 * label can never drift apart, and so this stays "the ONE mapping". A state
 * missing here falls back to its German label, which beats showing a raw
 * database code like `revision_required`.
 */
const LABELS_EN: Record<string, string> = {
  in_progress        : "In progress",
  submitted          : "Submitted",
  revision_required  : "Revision required",
  resubmitted        : "Resubmitted",
  accepted           : "Accepted",
  abandoned          : "Abandoned",
  withdrawn          : "Withdrawn",
  transferred        : "Transferred",
  requested          : "Requested",
  approved           : "Approved",
  rejected           : "Rejected",
  assigned           : "Assigned",
  cancelled          : "Cancelled",
  completed          : "Completed",
  waiting            : "Waiting",
  active             : "Active",
  draft              : "Draft",
  in_review          : "In review",
  published          : "Published",
  archived           : "Archived",
  open               : "Open",
  answered           : "Answered",
  pending            : "Pending",
  delivered          : "Delivered",
  read               : "Read",
  failed             : "Failed",
  invited            : "Invited",
  suspended          : "Suspended",
  removed            : "Removed",
  inactive           : "Inactive",
  eligible           : "Eligible",
  issued             : "Issued",
  available          : "Available",
  revoked            : "Revoked",
  expired            : "Expired",
  processing         : "Processing",
};

const LABELS_RU: Record<string, string> = {
  in_progress        : "В работе",
  submitted          : "Отправлено",
  revision_required  : "Требуется доработка",
  resubmitted        : "Отправлено повторно",
  accepted           : "Принято",
  abandoned          : "Прервано",
  withdrawn          : "Отозвано",
  transferred        : "Передано",
  requested          : "Запрошено",
  approved           : "Одобрено",
  rejected           : "Отклонено",
  assigned           : "Назначено",
  cancelled          : "Отменено",
  completed          : "Завершено",
  waiting            : "Ожидание",
  active             : "Активно",
  draft              : "Черновик",
  in_review          : "На проверке",
  published          : "Опубликовано",
  archived           : "В архиве",
  open               : "Открыто",
  answered           : "Отвечено",
  pending            : "Ожидает",
  delivered          : "Доставлено",
  read               : "Прочитано",
  failed             : "Ошибка",
  invited            : "Приглашён",
  suspended          : "Приостановлено",
  removed            : "Удалено",
  inactive           : "Неактивно",
  eligible           : "Доступно",
  issued             : "Выдано",
  available          : "Доступно",
  revoked            : "Отозвано",
  expired            : "Истекло",
  processing         : "Обрабатывается",
};

function labelFor(state: string, locale: string | undefined): string | undefined {
  if (locale === "en") return LABELS_EN[state];
  if (locale === "ru") return LABELS_RU[state];
  return undefined;
}

export function StatusBadge({
  state,
  className,
  locale,
}: {
  state: string | null | undefined;
  className?: string;
  /** Omit for German. Every caller that has a locale in scope should pass it. */
  locale?: string | undefined;
}) {
  if (!state) return null;
  // Unknown states render honestly rather than crashing or silently vanishing.
  const entry = STATUS[state] ?? { label: state, tone: "neutral" as Tone };
  return (
    <Badge tone={entry.tone} dot className={className}>
      {labelFor(state, locale) ?? entry.label}
    </Badge>
  );
}

/** Exported so a screen can label a state inline without rendering a badge. */
export function statusLabel(state: string, locale?: string): string {
  return labelFor(state, locale) ?? STATUS[state]?.label ?? state;
}
