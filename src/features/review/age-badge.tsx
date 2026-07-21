import { Badge } from "@/shared/ui";
import { ageTone, formatWaiting } from "./format";
import type { Translate } from "./i18n";

/**
 * How long someone has been waiting, in words plus a tone. Amber past 24 h, red
 * past 72 h. The tone never carries the meaning on its own — the text does, and
 * the badge has a title for the exact rule.
 */
export function AgeBadge({ hours, t }: { hours: number; t: Translate }) {
  const tone = ageTone(hours);
  const rule =
    tone === "danger"
      ? t("trainer.queue.ageLate")
      : tone === "warning"
        ? t("trainer.queue.ageWarn")
        : t("trainer.queue.ageFresh");

  return (
    <Badge tone={tone} dot title={rule}>
      {formatWaiting(hours, t)}
    </Badge>
  );
}
