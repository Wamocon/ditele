import { describe, it, expect } from "vitest";
import {
  computeCourseUnlocks,
  computeArenaUnlocks,
  isCourseComplete,
  type CourseTaskLite,
  type ArenaTaskLite,
} from "./unlock";

// Mirrors the seeded course: t1 (mcq, no arena), t2 (mcq, attached arena a1), t3 (no mcq, no arena).
const TASKS: CourseTaskLite[] = [
  { id: "t1", order_index: 1, mcq_question: "q", arena_task_id: null },
  { id: "t2", order_index: 2, mcq_question: "q", arena_task_id: "a1" },
  { id: "t3", order_index: 3, mcq_question: null, arena_task_id: null },
];
const ARENA: ArenaTaskLite[] = [
  { id: "a1", order_index: 1 },
  { id: "a2", order_index: 2 },
];

describe("computeArenaUnlocks", () => {
  it("opens #1 and locks the rest until the previous is accepted", () => {
    const none = computeArenaUnlocks(ARENA, new Set());
    expect(none.get("a1")?.unlocked).toBe(true);
    expect(none.get("a2")?.unlocked).toBe(false);

    const a1done = computeArenaUnlocks(ARENA, new Set(["a1"]));
    expect(a1done.get("a2")?.unlocked).toBe(true);
  });
});

describe("computeCourseUnlocks", () => {
  it("first task is open; attached-arena task waits on its arena; later tasks wait on the previous question", () => {
    const start = computeCourseUnlocks(TASKS, new Set(), new Set());
    expect(start.get("t1")?.unlocked).toBe(true);
    // t2 has arena a1 (not accepted) -> locked with reason "arena"
    expect(start.get("t2")).toMatchObject({ unlocked: false, reason: "arena" });
    // t3 has no arena, but t2's question isn't answered -> locked "previous_question"
    expect(start.get("t3")).toMatchObject({ unlocked: false, reason: "previous_question" });
  });

  it("t2 opens once its arena is accepted AND t1 is submitted", () => {
    const arenaOnly = computeCourseUnlocks(TASKS, new Set(), new Set(["a1"]));
    // arena done but t1 not submitted -> still blocked on the previous question
    expect(arenaOnly.get("t2")).toMatchObject({ unlocked: false, reason: "previous_question" });

    const both = computeCourseUnlocks(TASKS, new Set(["t1"]), new Set(["a1"]));
    expect(both.get("t2")?.unlocked).toBe(true);
    // t3 still needs t2 submitted
    expect(both.get("t3")?.unlocked).toBe(false);
  });

  it("t3 opens once t2 is submitted (its question answered)", () => {
    const done = computeCourseUnlocks(TASKS, new Set(["t1", "t2"]), new Set(["a1"]));
    expect(done.get("t3")?.unlocked).toBe(true);
  });

  it("trainer acceptance of course tasks does NOT gate — only submission of the previous question does", () => {
    // t1 submitted (not accepted), a1 accepted -> t2 open regardless of t1 acceptance
    const r = computeCourseUnlocks(TASKS, new Set(["t1"]), new Set(["a1"]));
    expect(r.get("t2")?.unlocked).toBe(true);
  });
});

describe("isCourseComplete", () => {
  it("is true only when every active course task is accepted", () => {
    expect(isCourseComplete(["t1", "t2", "t3"], new Set(["t1", "t2"]))).toBe(false);
    expect(isCourseComplete(["t1", "t2", "t3"], new Set(["t1", "t2", "t3"]))).toBe(true);
    expect(isCourseComplete([], new Set())).toBe(false);
  });
});
