import { SkeletonCard } from "@/shared/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
