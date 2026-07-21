import { Skeleton } from "@/shared/ui";

/**
 * Table-shaped loading state for the list routes. A skeleton that matches the
 * layout it replaces stops the page jumping when the rows arrive; three generic
 * cards do not.
 */
export function ListSkeleton({ rows = 6, filters = false }: { rows?: number; filters?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {filters && (
        <div className="flex flex-col gap-3 rounded-[--radius-lg] border border-[--color-border] p-4 sm:flex-row lg:p-5">
          <Skeleton className="h-11 w-full sm:w-40" />
          <Skeleton className="h-11 w-full sm:w-40" />
          <Skeleton className="h-11 w-full sm:w-40" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Skeleton className="hidden h-8 w-full md:block" />
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full md:h-12" />
        ))}
      </div>
    </div>
  );
}
