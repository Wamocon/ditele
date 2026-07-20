import type { TransitionMap } from "../common/state-machine";

export const QUESTION_STATES = [
  "open",
  "assigned",
  "answered",
  "transferred",
  "archived",
] as const;
export type QuestionState = (typeof QUESTION_STATES)[number];

export const questionTransitions = {
  open: ["assigned", "archived"],
  assigned: ["answered", "transferred", "archived"],
  answered: ["archived"],
  transferred: ["assigned", "answered", "archived"],
  archived: [],
} as const satisfies TransitionMap<QuestionState>;

