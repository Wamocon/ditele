import { Award } from "lucide-react";
import type { EarnedBadge } from "@/shared/data/learning";

export function BadgeGrid({ badges }: { badges: EarnedBadge[] }) {
  return (
    <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {badges.map((badge) => (
        <li key={badge.id}>
          <div className="flex h-full items-center gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-3 shadow-(--shadow-sm)">
            {badge.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- author-supplied external badge art
              <img
                src={badge.imageUrl}
                alt=""
                className="size-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand)">
                <Award className="size-6" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{badge.name}</p>
              {badge.description && (
                <p className="line-clamp-2 text-[13px] text-(--color-fg-muted)">{badge.description}</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
