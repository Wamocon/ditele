import { describe, expect, it } from "vitest";

import { canTransitionQuestion } from "./question";

describe("question state machine", () => {
  it("preserves reassignment after a transfer", () => {
    expect(canTransitionQuestion("assigned", "transferred")).toBe(true);
    expect(canTransitionQuestion("transferred", "assigned")).toBe(true);
    expect(canTransitionQuestion("assigned", "answered")).toBe(true);
  });

  it("keeps archived threads terminal", () => {
    expect(canTransitionQuestion("archived", "assigned")).toBe(false);
  });
});
