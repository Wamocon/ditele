import { Skeleton } from "@/shared/ui";

/**
 * Mirrors the frame's real geometry — header block, then a main column with an
 * aside beside it from `lg`. A skeleton of the wrong shape produces exactly
 * the layout shift the visual-correctness checklist forbids.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-40 w-full rounded-(--radius-md)" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-(--radius-md)" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-(--radius-md) lg:w-80 lg:shrink-0" />
      </div>
    </div>
  );
}
