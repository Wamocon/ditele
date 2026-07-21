import { Skeleton, SkeletonCard, SkeletonText } from "@/shared/ui";

/** Mirrors the studio's real shape: header, lifecycle bar, then stage cards. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-8 w-80" />
      </div>
      <div className="rounded-(--radius-lg) border border-(--color-border) p-4 lg:p-5">
        <Skeleton className="mb-3 h-5 w-40" />
        <Skeleton className="mb-4 h-6 w-full max-w-lg" />
        <SkeletonText lines={4} />
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
