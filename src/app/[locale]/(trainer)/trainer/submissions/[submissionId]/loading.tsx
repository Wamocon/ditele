import { Skeleton, SkeletonText } from "@/shared/ui";

/** Mirrors the real layout so the page does not jump when the data lands. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-52" />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[--radius-lg] border border-[--color-border] bg-[--color-border] sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 bg-[--color-bg] px-4 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-4 rounded-[--radius-lg] border border-[--color-border] p-4 lg:p-5"
          >
            <Skeleton className="h-5 w-40" />
            <SkeletonText lines={6} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-[--radius-lg] border border-[--color-border] p-4 lg:p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-11 w-full sm:flex-1" />
          <Skeleton className="h-11 w-full sm:flex-1" />
          <Skeleton className="h-11 w-32" />
        </div>
      </div>
    </div>
  );
}
