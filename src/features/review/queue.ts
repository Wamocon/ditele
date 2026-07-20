import type { ReviewQueueFilters, ReviewQueueItem } from "./model";

export function filterAndPrioritizeReviewQueue(
  items: readonly ReviewQueueItem[],
  filters: ReviewQueueFilters,
  now: Date = new Date(),
): readonly ReviewQueueItem[] {
  const search = filters.search?.trim().toLocaleLowerCase();
  const ageBoundary = filters.olderThanHours === undefined
    ? undefined
    : now.getTime() - filters.olderThanHours * 60 * 60 * 1_000;

  return items
    .filter((item) => filters.groupId === undefined || item.groupId === filters.groupId)
    .filter((item) => filters.state === undefined || item.state === filters.state)
    .filter((item) => {
      if (filters.ownership === undefined || filters.ownership === "all") {
        return true;
      }
      const transferred = item.transfer?.status === "accepted";
      return filters.ownership === "transferred" ? transferred : !transferred;
    })
    .filter((item) => ageBoundary === undefined || Date.parse(item.submittedAt) <= ageBoundary)
    .filter((item) => {
      if (!search) {
        return true;
      }
      return `${item.learnerName} ${item.taskTitle} ${item.groupName}`
        .toLocaleLowerCase()
        .includes(search);
    })
    .toSorted((left, right) => {
      const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
      const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }
      return Date.parse(left.submittedAt) - Date.parse(right.submittedAt);
    });
}
