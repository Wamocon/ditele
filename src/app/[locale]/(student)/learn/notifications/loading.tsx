import { Skeleton, SkeletonCard } from "@/shared/ui";

/** Skeletons, not a spinner — the shape of the page it is replacing. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-80" />
      </div>
      <Skeleton className="h-3 w-24" />
      <div className="flex flex-col gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
