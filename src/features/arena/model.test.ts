import { describe, expect, it } from "vitest";
import {
  gateQuestionLock,
  huntPrerequisite,
  huntScenarioLock,
  huntTaskHref,
  toLockReason,
  toLockReasons,
} from "./model";

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
      // Phase 1c widened the shape. These belong to the two new codes and are
      // null on every other reason — asserted explicitly rather than loosened
      // to `toMatchObject`, because a field silently going missing is the exact
      // failure this file exists to catch.
      scenarioCode: null,
      scenarioTitle: null,
      previousTaskId: null,
      previousTaskTitle: null,
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
      scenarioCode: null,
      scenarioTitle: null,
      previousTaskId: null,
      previousTaskTitle: null,
    });
  });

  it("rejects a shape it does not recognise rather than inventing one", () => {
    expect(toLockReason({ nope: true })).toBeNull();
    expect(toLockReason(null)).toBeNull();
  });

  /**
   * The Phase 1c fields go through the same idempotence trap as the WS-8 ones:
   * `scenario_code` on the way in, `scenarioCode` on the way out, both nullish.
   * A second normalisation that dropped them would take the "Zur Arena" button
   * with it and leave the sentence beside it working — the same undebuggable
   * symptom, one feature later.
   */
  it("carries the Phase 1c fields, and keeps them on a second pass", () => {
    const once = toLockReason({
      code: "required_hunt",
      scenario_code: "checkout-v1",
      scenario_title: "Kassen-Jagd",
    });
    expect(once?.scenarioCode).toBe("checkout-v1");
    expect(once?.scenarioTitle).toBe("Kassen-Jagd");
    expect(toLockReason(once)).toEqual(once);
  });
});

describe("huntScenarioLock", () => {
  it("finds the Arena gate and ignores the older required_task one", () => {
    const reasons = [
      FROM_DATABASE,
      { code: "required_hunt", scenario_code: "checkout-v1", scenario_title: "Kassen-Jagd" },
    ];
    expect(huntScenarioLock(reasons)?.scenarioCode).toBe("checkout-v1");
    // ...and the two do not collide: required_task still resolves separately.
    expect(huntPrerequisite(reasons)?.requiredTaskKind).toBe("hunt");
  });

  it("returns null when no Arena gate is present", () => {
    expect(huntScenarioLock([FROM_DATABASE])).toBeNull();
    expect(huntScenarioLock("nonsense")).toBeNull();
  });
});

describe("gateQuestionLock", () => {
  /**
   * §1.6: the question gate names the PREVIOUS task, because a skipped question
   * blocks progression past its own task rather than the task itself. A helper
   * that returned the locked task's id would send the learner to a door they
   * cannot open.
   */
  it("names the previous task, not the locked one", () => {
    const found = gateQuestionLock([
      {
        code: "gate_question",
        previous_task_id: "019f9100-0000-7000-8000-000000000001",
        previous_task_title: "Checkout-Jagd",
      },
    ]);
    expect(found?.previousTaskId).toBe("019f9100-0000-7000-8000-000000000001");
    expect(found?.previousTaskTitle).toBe("Checkout-Jagd");
  });

  /**
   * Both gates outstanding at once is the case §1.6 calls out explicitly — "the
   * NEXT course task stays locked, even if its own Arena task is already
   * approved" — so each helper must find its own reason in a mixed list.
   */
  it("coexists with the Arena gate; both are found in one list", () => {
    const reasons = [
      { code: "required_hunt", scenario_code: "checkout-v1", scenario_title: "Kassen-Jagd" },
      { code: "gate_question", previous_task_id: "019f9100-0000-7000-8000-000000000001" },
    ];
    expect(huntScenarioLock(reasons)?.code).toBe("required_hunt");
    expect(gateQuestionLock(reasons)?.code).toBe("gate_question");
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
