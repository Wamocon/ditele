"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Route } from "next";
import { Search } from "lucide-react";
import { Button, Input, Select } from "@/shared/ui";

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Search + one dropdown, both held in the URL so a filtered list is linkable
 * and survives a reload (MASTER_PLAN §13.4). Submitting resets to page 1.
 *
 * `SearchInput` is a Wave 0b component that has not landed; this is the
 * documented fallback — a plain form around `Input`, which also means the whole
 * thing works without JavaScript.
 */
export function ListFilters({
  basePath,
  searchLabel,
  searchValue,
  filterLabel,
  filterValue,
  filterOptions,
  allLabel,
  submitLabel,
}: {
  basePath: string;
  searchLabel: string;
  searchValue: string;
  filterLabel: string;
  filterValue: string;
  filterOptions: FilterOption[];
  allLabel: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(searchValue);
  const [filter, setFilter] = useState(filterValue);

  const apply = (nextSearch: string, nextFilter: string) => {
    const next = new URLSearchParams(params.toString());
    if (nextSearch.trim()) next.set("q", nextSearch.trim());
    else next.delete("q");
    if (nextFilter) next.set("filter", nextFilter);
    else next.delete("filter");
    next.delete("page");
    const query = next.toString();
    router.push((query ? `${basePath}?${query}` : basePath) as Route);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(search, filter);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      role="search"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="ws5-search" className="text-[13px] font-semibold leading-4">
          {searchLabel}
        </label>
        <Input
          id="ws5-search"
          name="q"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:w-56">
        <label htmlFor="ws5-filter" className="text-[13px] font-semibold leading-4">
          {filterLabel}
        </label>
        <Select
          id="ws5-filter"
          name="filter"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            apply(search, event.target.value);
          }}
        >
          <option value="">{allLabel}</option>
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" variant="outline" iconLeft={<Search className="size-4" aria-hidden />}>
        {submitLabel}
      </Button>
    </form>
  );
}
