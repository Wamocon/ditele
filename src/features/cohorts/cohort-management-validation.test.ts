import { describe, expect, it } from "vitest";

import {
  classifyCohortCommandRpcError,
  parseCohortTransitionForm,
  parseTaskScheduleForm,
} from "./cohort-management-validation";

const cohortId = "01980a30-0000-7000-8000-000000000001";
const taskId = "01980a26-0000-7000-8000-000000000001";

function baseForm() {
  const form = new FormData();
  form.set("cohortId", cohortId);
  form.set("expectedVersion", "1");
  form.set("reason", "Authorized scheduling adjustment");
  form.set("idempotencyKey", "cohort-command-key-0001");
  form.set("locale", "de");
  form.set("perspective", "trainer");
  return form;
}

describe("cohort command validation", () => {
  it("parses an explicit lifecycle target and idempotency key", () => {
    const form = baseForm();
    form.set("targetState", "completed");
    expect(parseCohortTransitionForm(form)).toMatchObject({
      cohortId,
      expectedVersion: 1,
      targetState: "completed",
      locale: "de",
      perspective: "trainer",
    });
  });

  it("parses UTC schedule boundaries and supports expected version zero", () => {
    const form = baseForm();
    form.set("taskId", taskId);
    form.set("expectedVersion", "0");
    form.set("availableFrom", "2026-07-20T08:30");
    form.set("dueAt", "2026-07-27T18:00");
    expect(parseTaskScheduleForm(form)).toMatchObject({
      expectedVersion: 0,
      availableFrom: "2026-07-20T08:30:00.000Z",
      dueAt: "2026-07-27T18:00:00.000Z",
    });
  });

  it("rejects a due date that is not after availability", () => {
    const form = baseForm();
    form.set("taskId", taskId);
    form.set("availableFrom", "2026-07-27T18:00");
    form.set("dueAt", "2026-07-20T08:30");
    expect(() => parseTaskScheduleForm(form)).toThrow();
  });

  it("classifies stale, scope, idempotency and state-machine failures", () => {
    expect(
      classifyCohortCommandRpcError({ code: "40001", message: "stale" }, "transition"),
    ).toBe("stale");
    expect(
      classifyCohortCommandRpcError({ code: "42501", message: "denied" }, "schedule"),
    ).toBe("forbidden");
    expect(
      classifyCohortCommandRpcError(
        { code: "22023", message: "idempotency key was reused" },
        "schedule",
      ),
    ).toBe("idempotency");
    expect(
      classifyCohortCommandRpcError({ code: "23514", message: "invalid" }, "transition"),
    ).toBe("illegal_transition");
  });
});
