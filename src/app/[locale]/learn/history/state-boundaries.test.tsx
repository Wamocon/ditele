import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  params: {} as { locale?: string },
}));

vi.mock("next/navigation", () => ({
  useParams: () => navigation.params,
}));

import LearnerHistoryError from "./error";
import LearnerHistoryLoading from "./loading";

describe("learner history route states", () => {
  it("renders localized loading copy and safely falls back to English", () => {
    navigation.params = { locale: "ru" };
    const { rerender } = render(<LearnerHistoryLoading />);
    expect(
      screen.getByRole("heading", { name: "Загрузка истории обучения…" }),
    ).toBeInTheDocument();

    navigation.params = { locale: "unsupported" };
    rerender(<LearnerHistoryLoading />);
    expect(
      screen.getByRole("heading", { name: "Loading learning history…" }),
    ).toBeInTheDocument();
  });

  it("renders a localized retryable error boundary", () => {
    navigation.params = { locale: "de" };
    const reset = vi.fn();
    render(<LearnerHistoryError reset={reset} />);

    expect(
      screen.getByRole("heading", {
        name: "Lernverlauf konnte nicht geladen werden",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
