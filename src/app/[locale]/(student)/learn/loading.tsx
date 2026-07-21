import { Skeleton, SkeletonCard } from "@/shared/ui";

/** Mirrors the dashboard: hero card, three tiles, then the course grid. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-[220px] w-full rounded-(--radius-lg)" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-5">
        <Skeleton className="h-[92px] rounded-(--radius-lg)" />
        <Skeleton className="h-[92px] rounded-(--radius-lg)" />
        <Skeleton className="h-[92px] rounded-(--radius-lg)" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
