import { Skeleton, SkeletonCard } from "@/shared/ui";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-3 h-4 w-40" />
      <Skeleton className="mb-3 h-8 w-3/4 max-w-[520px]" />
      <Skeleton className="mb-8 h-5 w-full max-w-[420px]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
