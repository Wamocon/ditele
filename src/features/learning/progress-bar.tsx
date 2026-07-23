export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-(--color-surface-2)"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Fortschritt"
    >
      <div
        className="h-full rounded-full bg-(--color-brand) transition-[width] duration-(--duration-base)"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
