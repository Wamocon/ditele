import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useParams } = vi.hoisted(() => ({ useParams: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams }));

import GlobalError from "./error";

describe("GlobalError", () => {
  beforeEach(() => {
    useParams.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("localizes the recovery UI and exposes only a sanitized support reference", () => {
    useParams.mockReturnValue({ locale: "de" });
    const reset = vi.fn();
    const error = Object.assign(new Error("sensitive internal detail"), {
      digest: "4055559233",
    });

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Etwas ist schiefgelaufen" })).toBeVisible();
    expect(screen.getByText("4055559233")).toBeVisible();
    expect(screen.queryByText("sensitive internal detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("does not render an unsafe digest and falls back to English", () => {
    useParams.mockReturnValue({ locale: "unsupported" });
    const error = Object.assign(new Error("failure"), {
      digest: "unsafe reference with spaces",
    });

    render(<GlobalError error={error} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    expect(screen.queryByText(/unsafe reference/)).not.toBeInTheDocument();
    expect(screen.queryByText("Error reference:")).not.toBeInTheDocument();
  });
});
