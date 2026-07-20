import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import LoginPage from "./login/page";
import RegisterPage from "./register/page";
import ResetPasswordPage from "./reset-password/page";
import { authCopy } from "./copy";

describe("localized authentication throttle denial", () => {
  it.each(["en", "de", "ru"] as const)(
    "renders one generic %s denial on every anonymous authentication surface",
    async (locale) => {
      const surfaces = [
        await LoginPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ error: "throttled" }),
        }),
        await RegisterPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ error: "throttled" }),
        }),
        await ResetPasswordPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ error: "throttled" }),
        }),
      ];

      for (const surface of surfaces) {
        const view = render(surface);
        expect(screen.getByRole("status")).toHaveTextContent(
          authCopy[locale].throttled,
        );
        expect(screen.getByRole("status")).not.toHaveTextContent(
          authCopy[locale].invalid,
        );
        view.unmount();
      }
    },
  );

  it.each(["en", "de", "ru"] as const)(
    "renders the localized %s provider-outage state without blaming credentials",
    async (locale) => {
      const view = render(await LoginPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({ error: "unavailable" }),
      }));
      expect(screen.getByRole("status")).toHaveTextContent(
        authCopy[locale].unavailable,
      );
      expect(screen.getByRole("status")).not.toHaveTextContent(
        authCopy[locale].invalid,
      );
      view.unmount();
    },
  );
});
