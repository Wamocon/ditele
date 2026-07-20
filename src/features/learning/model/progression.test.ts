import { describe, expect, it } from "vitest";

import {
  evaluateActivityAvailability,
  selectNextActivity,
  type LearningActivity,
  type ProgressionContext,
} from "./progression";

const activity: LearningActivity = {
  id: "task-2",
  stageId: "stage-1",
  title: "Write a test report",
  type: "task",
  order: 2,
  activationAt: "2026-07-18T08:00:00.000Z",
  prerequisiteActivityIds: ["task-1"],
  prerequisiteSkillIds: ["skill-reporting"],
};

const context: ProgressionContext = {
  mode: "legacy_schedule",
  now: "2026-07-17T08:00:00.000Z",
  prerequisitesEnabled: true,
  completedActivityIds: [],
  masteredSkillIds: [],
  manuallyUnlockedActivityIds: [],
};

describe("progression policy", () => {
  it("keeps legacy date activation during migration and explains blockers", () => {
    expect(evaluateActivityAvailability(activity, context)).toEqual({
      state: "blocked",
      reasons: [
        { code: "activation_date", referenceId: "2026-07-18T08:00:00.000Z" },
        { code: "activity_prerequisite", referenceId: "task-1" },
      ],
    });
  });

  it("checks skill prerequisites only for the competency path", () => {
    const decision = evaluateActivityAvailability(activity, {
      ...context,
      mode: "competency_path",
      completedActivityIds: ["task-1"],
    });
    expect(decision.reasons).toEqual([
      { code: "skill_prerequisite", referenceId: "skill-reporting" },
    ]);
  });

  it("prioritizes revision work before a later available activity", () => {
    const revision = { ...activity, currentState: "revision_required" as const };
    const available = {
      ...activity,
      id: "task-3",
      order: 3,
      activationAt: undefined,
      prerequisiteActivityIds: [],
      prerequisiteSkillIds: [],
    };
    expect(
      selectNextActivity([available, revision], {
        ...context,
        now: "2026-07-19T08:00:00.000Z",
        completedActivityIds: ["task-1"],
      })?.activity.id,
    ).toBe("task-2");
  });
});
