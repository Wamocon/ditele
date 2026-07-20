import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import deMessages from "@/shared/i18n/messages/de.json";
import enMessages from "@/shared/i18n/messages/en.json";
import ruMessages from "@/shared/i18n/messages/ru.json";

import { PublicHeader } from "./public-header";

describe("public header", () => {
  it.each([
    ["en", enMessages, "FAQ"],
    ["de", deMessages, "FAQ"],
    ["ru", ruMessages, "Вопросы и ответы"],
  ] as const)("links to the locale-preserving FAQ route in %s", (locale, messages, label) => {
    render(<PublicHeader locale={locale} messages={messages} />);

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(within(primaryNavigation).getByRole("link", { name: label })).toHaveAttribute(
      "href",
      `/${locale}/faq`,
    );
    expect(
      within(primaryNavigation).getByRole("link", {
        name: messages.nav.legal,
      }),
    ).toHaveAttribute("href", `/${locale}/legal`);

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Mobile navigation",
    });
    expect(
      within(mobileNavigation).getByRole("link", {
        name: messages.nav.legal,
      }),
    ).toHaveAttribute("href", `/${locale}/legal`);
    expect(
      screen.getByText(messages.common.openMenu).closest("summary"),
    ).toHaveAccessibleName(messages.common.openMenu);
  });
});
