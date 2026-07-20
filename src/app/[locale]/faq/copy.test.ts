import { describe, expect, it } from "vitest";

import { locales } from "@/shared/i18n/config";

import { faqCopy, faqTopics } from "./copy";

describe("public FAQ copy", () => {
  it.each(locales)("preserves all seven canonical FAQ topics in %s", (locale) => {
    const copy = faqCopy[locale];

    expect(copy.items).toHaveLength(7);
    expect(copy.items.map((item) => item.topic)).toEqual(faqTopics);
    expect(copy.items.every((item) => item.question.trim() && item.answer.trim())).toBe(
      true,
    );
  });

  it.each(locales)("uses unique accessible disclosure labels in %s", (locale) => {
    const normalizedQuestions = faqCopy[locale].items.map((item) =>
      item.question.trim().toLocaleLowerCase(locale),
    );

    expect(new Set(normalizedQuestions).size).toBe(normalizedQuestions.length);
  });

  it("keeps all authored content free of markup and unsafe URLs", () => {
    const serializedCopy = JSON.stringify(faqCopy);

    expect(serializedCopy).not.toMatch(/<[^>]*>/u);
    expect(serializedCopy).not.toMatch(/javascript:|data:text\/html|on\w+\s*=/iu);

    for (const copy of Object.values(faqCopy)) {
      for (const item of copy.items) {
        if (!item.action) continue;

        if (item.action.kind === "internal") {
          expect(["/about", "/catalog"]).toContain(item.action.path);
        } else {
          expect(item.action.href).toBe("https://test-it-academy.com/");
        }
      }
    }
  });

  it.each(locales)("distinguishes platform completion from external claims in %s", (locale) => {
    const certificateAnswer = faqCopy[locale].items.find(
      (item) => item.topic === "certificates",
    )?.answer;
    const outcomeAnswer = faqCopy[locale].items.find(
      (item) => item.topic === "outcomes",
    )?.answer;
    const voucherAnswer = faqCopy[locale].items.find(
      (item) => item.topic === "training-voucher",
    )?.answer;

    expect(certificateAnswer).toContain("ISTQB");
    expect(outcomeAnswer).toBeTruthy();
    expect(voucherAnswer).toBeTruthy();
    expect(`${outcomeAnswer} ${voucherAnswer}`).toMatch(
      locale === "en"
        ? /does not guarantee|cannot approve or guarantee/u
        : locale === "de"
          ? /garantiert weder|weder genehmigen noch garantieren/u
          : /не гарантирует|не может одобрить или гарантировать/u,
    );
  });
});
