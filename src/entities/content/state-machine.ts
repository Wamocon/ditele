import type { TransitionMap } from "../common/state-machine";

export const CONTENT_VERSION_STATES = [
  "draft",
  "in_review",
  "published",
  "archived",
] as const;
export type ContentVersionState = (typeof CONTENT_VERSION_STATES)[number];

export const contentVersionTransitions = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "published", "archived"],
  published: [],
  archived: [],
} as const satisfies TransitionMap<ContentVersionState>;

