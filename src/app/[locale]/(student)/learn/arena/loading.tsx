import { Skeleton, SkeletonCard } from "@/shared/ui";

/**
 * Mirrors the hub's real shape: the four-tile standing card, then the hunt,
 * badge and XP sections. Matching the layout means the page does not jump when
 * the data lands — the layout-shift rule the sandbox checklist enforces applies
 * here too.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-[188px] w-full rounded-(--radius-lg)" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-[84px] w-full rounded-(--radius-lg)" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
