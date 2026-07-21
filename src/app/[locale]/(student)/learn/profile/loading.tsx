import { Skeleton, SkeletonCard } from "@/shared/ui";

/** Five cards, because the page has five sections. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <SkeletonCard className="h-64" />
      <SkeletonCard />
      <SkeletonCard className="h-48" />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
