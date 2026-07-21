import { Skeleton } from "@/shared/ui";

/**
 * The loading state for every auth screen. Shaped like the form that is about
 * to arrive — heading, two fields, button — so nothing jumps when it does.
 */
export function AuthSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
      <Skeleton className="mt-2 h-12 w-full" />
    </div>
  );
}
