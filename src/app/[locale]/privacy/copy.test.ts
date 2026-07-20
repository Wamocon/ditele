import { describe, expect, it } from "vitest";

import { privacyCopy } from "./copy";

describe("public privacy copy", () => {
  it.each(["en", "de", "ru"] as const)(
    "states the current self-service limitation in %s",
    (locale) => {
      const controls = privacyCopy[locale].sections[1];

      expect(controls).toBeDefined();
      expect(controls?.body).toMatch(
        locale === "en"
          ? /does not yet provide in-product self-service/i
          : locale === "de"
            ? /noch keine Self-Service-Anträge/i
            : /ещё нет встроенных самостоятельных запросов/i,
      );
    },
  );

  it("does not claim that consent history or request workflows are already provided", () => {
    const allCopy = Object.values(privacyCopy)
      .flatMap((copy) => copy.sections.map((section) => section.body))
      .join(" ");

    expect(allCopy).not.toContain(
      "The platform provides consent history and request workflows",
    );
    expect(allCopy).not.toContain(
      "Die Plattform bietet Einwilligungsverlauf und Anträge",
    );
    expect(allCopy).not.toContain(
      "Платформа предусматривает историю согласий и запросы",
    );
  });
});
