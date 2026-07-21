import { Skeleton, SkeletonText } from "@/shared/ui";

/** Mirrors the workspace's own two-column shape so the layout does not jump. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-2/3 max-w-[420px]" />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          <SkeletonText lines={4} className="max-w-[68ch]" />
          <Skeleton className="h-[360px] w-full rounded-(--radius-lg)" />
        </div>
        <div className="mt-6 flex flex-col gap-4 lg:mt-0">
          <Skeleton className="h-[420px] w-full rounded-(--radius-lg)" />
        </div>
      </div>
    </div>
  );
}
