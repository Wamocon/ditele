import { describe, expect, it } from "vitest";
import { huntPrerequisite, huntTaskHref, toLockReason, toLockReasons } from "./model";

/**
 * Regression tests for the lock-reason normaliser, written by WS-13 after two
 * separate failures in the same seam — both of which were invisible.
 *
 * The seam is this: `app_private.learner_snapshot_task_lock_reasons` returns
 * snake_case objects, `LearningActivity.lockReasons` holds camelCase ones, and
 * both shapes flow through the same helper. Neither failure raised an error;
 * one blanked a course page, the other quietly dropped a link.
 */

const FROM_DATABASE = {
  code: "required_task",
  required_task_id: "019f9100-0000-7000-8000-000000000001",
  required_task_kind: "hunt",
  required_task_title: "Checkout-Jagd",
};

describe("toLockReason", () => {
  it("normalises the snake_case row the RPC returns", () => {
    expect(toLockReason(FROM_DATABASE)).toEqual({
      code: "required_task",
      requiredTaskId: "019f9100-0000-7000-8000-000000000001",
      requiredTaskKind: "hunt",
      requiredTaskTitle: "Checkout-Jagd",
    });
  });

  /**
   * ⭐ The one that bit. Both key sets are `nullish` in the schema, so feeding
   * a normalised reason back in **parsed successfully and returned nulls** —
   * no error, no warning, just a lock reason that had forgotten which task it
   * was waiting on. The unlock link vanished while the lock text beside it kept
   * working, which is about the least debuggable symptom available.
   */
  it("is IDEMPOTENT — normalising its own output changes nothing", () => {
    const once = toLockReason(FROM_DATABASE);
    expect(toLockReason(once)).toEqual(once);
    expect(toLockReason(once)?.requiredTaskId).toBe(FROM_DATABASE.required_task_id);
  });

  it("accepts a bare string, which is how this was typed before WS-8", () => {
    expect(toLockReason("schedule")).toEqual({
      code: "schedule",
      requiredTaskId: null,
      requiredTaskKind: null,
      requiredTaskTitle: null,
    });
  });

  it("rejects a shape it does not recognise rather than inventing one", () => {
    expect(toLockReason({ nope: true })).toBeNull();
    expect(toLockReason(null)).toBeNull();
  });
});

describe("huntPrerequisite", () => {
  it("finds the hunt in a raw RPC array", () => {
    expect(huntPrerequisite([FROM_DATABASE])?.requiredTaskId).toBe(
      FROM_DATABASE.required_task_id,
    );
  });

  it("finds the hunt in an ALREADY-NORMALISED array", () => {
    // `stage-list.tsx` calls it exactly this way, because the data layer now
    // normalises at the boundary. This assertion is the reason the link renders.
    expect(huntPrerequisite(toLockReasons([FROM_DATABASE]))?.requiredTaskId).toBe(
      FROM_DATABASE.required_task_id,
    );
  });

  it("ignores a prerequisite that is not a hunt", () => {
    expect(
      huntPrerequisite([{ ...FROM_DATABASE, required_task_kind: "practical" }]),
    ).toBeNull();
  });

  it("ignores a lock that is not a task prerequisite at all", () => {
    expect(huntPrerequisite(["schedule", { code: "entitlement" }])).toBeNull();
  });

  it("returns null rather than throwing on junk", () => {
    expect(huntPrerequisite(undefined)).toBeNull();
    expect(huntPrerequisite("not an array")).toBeNull();
  });
});

describe("huntTaskHref", () => {
  it("points at the task route, because a hunt is a task", () => {
    expect(huntTaskHref("de", "abc")).toBe("/de/learn/tasks/abc");
  });
});
