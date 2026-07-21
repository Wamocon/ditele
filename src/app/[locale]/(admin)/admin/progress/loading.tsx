import { Skeleton, SkeletonCard } from "@/shared/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      {/* The risk-summary line and the filter chips, so the layout does not
          jump when the real board arrives. */}
      <Skeleton className="h-6 w-48" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-11 w-28" />
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
