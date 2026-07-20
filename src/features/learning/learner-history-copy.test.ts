import { describe, expect, it } from "vitest";

import { learnerHistoryEventKinds } from "./model/learner-history";
import {
  hasCompleteLearnerHistoryCopy,
  learnerHistoryCopy,
} from "./learner-history-copy";

describe("learner history copy", () => {
  it("provides complete EN, DE, and RU event/state copy", () => {
    for (const locale of ["en", "de", "ru"] as const) {
      const copy = learnerHistoryCopy[locale];
      expect(hasCompleteLearnerHistoryCopy(copy)).toBe(true);
      expect(Object.keys(copy.kinds).toSorted()).toEqual(
        [...learnerHistoryEventKinds].toSorted(),
      );
      expect(copy.title).not.toMatch(/TODO|placeholder/i);
      expect(copy.emptyTitle).not.toHaveLength(0);
      expect(copy.forbiddenTitle).not.toHaveLength(0);
      expect(copy.loadingTitle).not.toHaveLength(0);
      expect(copy.errorTitle).not.toHaveLength(0);
    }
  });

  it("states the privacy boundary without claiming authored content is included", () => {
    expect(learnerHistoryCopy.en.privacyDescription).toContain("omits");
    expect(learnerHistoryCopy.de.privacyDescription).toContain("keine");
    expect(learnerHistoryCopy.ru.privacyDescription).toContain("не показываются");
    for (const copy of Object.values(learnerHistoryCopy)) {
      expect(copy.description).not.toMatch(/answer text|trainer comment|contact/i);
    }
  });
});

