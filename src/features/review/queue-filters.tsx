import type { ReactNode } from "react";
import { Button, Card, Select } from "@/shared/ui";

/**
 * A plain GET form. Filters live in the URL (00_MASTER_PLAN §13.4) and this
 * needs no client JavaScript to do it — submitting navigates, and the server
 * re-reads `searchParams`. It also keeps working with JS disabled.
 */
export interface FilterOption {
  value: string;
  label: string;
}

export interface QueueFiltersProps {
  labels: { state: string; cohort: string; sort: string; apply: string; reset: string };
  resetHref: string;
  fields: { name: string; label: string; value: string; options: FilterOption[] }[];
  children?: ReactNode;
}

export function QueueFilters({ labels, resetHref, fields }: QueueFiltersProps) {
  return (
    <Card className="mb-6" padded>
      <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {fields.map((field) => (
          <div key={field.name} className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-40">
            <label
              htmlFor={`filter-${field.name}`}
              className="text-[13px] font-semibold leading-4 text-(--color-fg)"
            >
              {field.label}
            </label>
            <Select id={`filter-${field.name}`} name={field.name} defaultValue={field.value}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ))}

        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            {labels.apply}
          </Button>
          <a
            href={resetHref}
            className="inline-flex min-h-11 items-center rounded-(--radius-md) px-3 text-[15px] font-semibold text-(--color-fg-muted) hover:bg-(--color-surface)"
          >
            {labels.reset}
          </a>
        </div>
      </form>
    </Card>
  );
}
