import { describe, expect, it } from "vitest";

import {
  learnerNotificationCopy,
  toLearnerNotificationClientCopy,
} from "./learner-copy";

describe("learner notification client copy", () => {
  it("removes every formatter before labels cross a client boundary", () => {
    for (const locale of ["en", "de", "ru"] as const) {
      const clientCopy = toLearnerNotificationClientCopy(
        learnerNotificationCopy[locale],
      );

      expect(() => structuredClone(clientCopy)).not.toThrow();
      expect("count" in clientCopy).toBe(false);
      expect("unreadCount" in clientCopy).toBe(false);
      expect("page" in clientCopy).toBe(false);
    }
  });
});
