import { Skeleton, SkeletonCard } from "@/shared/ui";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-3 h-8 w-56" />
      <Skeleton className="mb-6 h-5 w-full max-w-[420px]" />
      <Skeleton className="mb-6 h-11 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
