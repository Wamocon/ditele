import { Skeleton, SkeletonText } from "@/shared/ui";

/** Header, filter row, then table rows — the real shape of the task inventory. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-72" />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 sm:w-56" />
      </div>
      <div className="rounded-[--radius-lg] border border-[--color-border] p-4">
        <SkeletonText lines={10} />
      </div>
    </div>
  );
}
