import { Skeleton, SkeletonCard } from "@/shared/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-52" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
