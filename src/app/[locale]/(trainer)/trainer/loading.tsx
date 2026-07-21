import { Skeleton, SkeletonCard } from "@/shared/ui";

/** Same shape as the dashboard: four tiles, a queue list, then cohort cards. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-[--radius-lg] border border-[--color-border] p-4 lg:p-5"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-36" />
        <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
