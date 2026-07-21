import { Skeleton, SkeletonCard } from "@/shared/ui";

/** Landing-shaped: hero block, then a row of cards. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 py-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full max-w-[620px]" />
        <Skeleton className="h-5 w-full max-w-[520px]" />
        <Skeleton className="mt-2 h-12 w-48" />
      </div>
      <div className="grid gap-4 md:grid-cols-3 lg:gap-5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
