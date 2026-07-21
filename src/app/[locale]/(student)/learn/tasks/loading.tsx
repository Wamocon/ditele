import { Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-44" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-[--radius-md]" />
        ))}
      </div>
    </div>
  );
}
