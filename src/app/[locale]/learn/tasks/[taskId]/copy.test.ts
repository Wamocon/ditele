import { describe, expect, it } from "vitest";

import { locales } from "@/shared/i18n/config";

import { taskWorkspaceCopy } from "./copy";

describe("taskWorkspaceCopy", () => {
  it.each(locales)(
    "provides explicit autosave recovery copy for %s",
    (locale) => {
      const copy = taskWorkspaceCopy[locale];

      expect(copy.unsavedChanges.trim()).not.toHaveLength(0);
      expect(copy.retryDraft.trim()).not.toHaveLength(0);
      expect(copy.saveFailed).not.toBe(copy.submissionFailed);
      expect(copy.saveFailed.length).toBeGreaterThan(copy.draftSaved.length);
      expect(copy.evidenceTitle.trim()).not.toHaveLength(0);
      expect(copy.evidenceUrlInvalid).toMatch(/HTTPS/i);
    },
  );

  it("provides an explicit localized label for abandoned attempts", () => {
    expect(taskWorkspaceCopy.en.attemptStates.abandoned).toBe("Abandoned");
    expect(taskWorkspaceCopy.de.attemptStates.abandoned).toBe("Abgebrochen");
    expect(taskWorkspaceCopy.ru.attemptStates.abandoned).toBe("Прервано");
  });
});
