import { Skeleton } from "@/shared/ui";

/**
 * Loading placeholder for the queue and progress lists. Mirrors a table of rows
 * (with an optional filter bar) so the layout does not jump when data lands.
 */
export function ListSkeleton({ rows = 6, filters = false }: { rows?: number; filters?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {filters && (
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-11 w-40" />
          <Skeleton className="h-11 w-40" />
          <Skeleton className="h-11 w-28" />
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-(--radius-lg) border border-(--color-border) p-4 lg:p-5">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 py-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
