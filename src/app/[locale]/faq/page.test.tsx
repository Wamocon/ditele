import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { faqCopy } from "./copy";
import FaqPage, { generateMetadata } from "./page";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("route-not-found");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/shared/i18n/get-messages", () => ({
  getMessages: vi.fn(async (locale: "en" | "de" | "ru") => ({
    common: {
      brand: "DiTeLe",
      language: "Language",
      signIn: locale === "de" ? "Anmelden" : locale === "ru" ? "Войти" : "Sign in",
      theme: "Theme",
      openMenu: "Open navigation",
    },
    nav: {
      about: "About",
      catalog: "Catalog",
      faq: "FAQ",
      legal: "Legal",
      privacy: "Privacy",
    },
  })),
}));

describe("public FAQ page", () => {
  it.each(["en", "de", "ru"] as const)(
    "renders seven native, localized disclosures in %s",
    async (locale) => {
      const copy = faqCopy[locale];
      const view = render(
        await FaqPage({ params: Promise.resolve({ locale }) }),
      );

      expect(
        screen.getByRole("heading", { level: 1, name: copy.title }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: copy.sectionTitle }),
      ).toBeInTheDocument();

      const faqRegion = screen.getByRole("region", {
        name: copy.sectionTitle,
      });
      const disclosures = [...faqRegion.querySelectorAll("details")];
      expect(disclosures).toHaveLength(7);

      disclosures.forEach((disclosure, index) => {
        const summary = disclosure.querySelector("summary");
        expect(summary).not.toBeNull();
        expect(summary).toHaveTextContent(copy.items[index]?.question ?? "");
        expect(disclosure).toHaveTextContent(copy.items[index]?.answer ?? "");
      });

      const currentInformation = screen.getByRole("complementary", {
        name: copy.furtherHelpTitle,
      });
      expect(
        within(currentInformation).getByRole("link", {
          name: copy.furtherHelpAction,
        }),
      ).toHaveAttribute("href", `/${locale}/catalog`);
      const providerLink = view.container.querySelector(
        'a[href="https://test-it-academy.com/"]',
      );
      expect(providerLink).toHaveTextContent(copy.items[6]?.action?.label ?? "");
    },
  );

  it("keeps question text as the disclosure's accessible native label", async () => {
    render(await FaqPage({ params: Promise.resolve({ locale: "en" }) }));
    const faqRegion = screen.getByRole("region", {
      name: faqCopy.en.sectionTitle,
    });
    const disclosure = faqRegion.querySelector("details");
    const summary = disclosure?.querySelector("summary");
    const question = faqCopy.en.items[0]?.question;

    expect(disclosure).not.toBeNull();
    expect(summary).not.toBeNull();
    if (!summary || !question) throw new Error("expected first FAQ disclosure");

    expect(summary).toHaveAccessibleName(question);
    expect(within(summary).getByText(question)).toBeInTheDocument();
  });

  it("uses the localized metadata title", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "de" }) }),
    ).resolves.toEqual({ title: faqCopy.de.metadataTitle });
  });

  it("rejects unsupported locale routes through notFound", async () => {
    await expect(
      FaqPage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow("route-not-found");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
