import { describe, expect, it } from "vitest";

import type { ReviewQueueItem } from "./model";
import { filterAndPrioritizeReviewQueue } from "./queue";

const items: readonly ReviewQueueItem[] = [
  {
    id: "later-due",
    groupId: "group-1",
    groupName: "Group One",
    learnerName: "Ada",
    taskTitle: "API testing",
    state: "submitted",
    version: 1,
    submittedAt: "2026-07-17T09:00:00.000Z",
    dueAt: "2026-07-18T09:00:00.000Z",
  },
  {
    id: "transferred",
    groupId: "group-2",
    groupName: "Group Two",
    learnerName: "Grace",
    taskTitle: "Exploratory testing",
    state: "resubmitted",
    version: 2,
    submittedAt: "2026-07-16T09:00:00.000Z",
    dueAt: "2026-07-17T12:00:00.000Z",
    transfer: {
      id: "transfer-1",
      fromTrainerId: "trainer-1",
      toTrainerId: "trainer-2",
      createdAt: "2026-07-16T10:00:00.000Z",
      status: "accepted",
    },
  },
];

describe("filterAndPrioritizeReviewQueue", () => {
  it("prioritizes the earliest SLA deadline", () => {
    expect(filterAndPrioritizeReviewQueue(items, {}).map((item) => item.id))
      .toEqual(["transferred", "later-due"]);
  });

  it("filters transferred work and learner/task/group search", () => {
    expect(filterAndPrioritizeReviewQueue(items, {
      ownership: "transferred",
      search: "exploratory",
    }).map((item) => item.id)).toEqual(["transferred"]);
  });

  it("filters submissions older than the configured age", () => {
    expect(filterAndPrioritizeReviewQueue(
      items,
      { olderThanHours: 24 },
      new Date("2026-07-18T10:00:00.000Z"),
    ).map((item) => item.id)).toEqual(["transferred", "later-due"]);
  });
});
