import { Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-2/3 max-w-[420px]" />
      <Skeleton className="h-[84px] w-full rounded-[--radius-lg]" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[140px] w-full rounded-[--radius-lg]" />
        <Skeleton className="h-[64px] w-full rounded-[--radius-lg]" />
      </div>
    </div>
  );
}
