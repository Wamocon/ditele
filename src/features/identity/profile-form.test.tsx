import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { learnerProfileCopy } from "./profile-copy";
import { LearnerProfileForm } from "./profile-form";

describe("LearnerProfileForm", () => {
  it("renders only the supported accessible account fields", () => {
    render(
      <LearnerProfileForm
        action={vi.fn()}
        idempotencyKey="profile-form-test-0001"
        labels={learnerProfileCopy.en}
        profile={{
          userId: "01980a00-0000-7000-8000-000000000001",
          displayName: "Lena Learner",
          locale: "en",
          timezone: "Europe/Berlin",
          rowVersion: 4,
          updatedAt: "2026-07-18T10:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Display name" }))
      .toHaveValue("Lena Learner");
    expect(screen.getByRole("combobox", { name: "Preferred language" }))
      .toHaveValue("en");
    expect(screen.getByRole("combobox", { name: "Time zone" }))
      .toHaveValue("Europe/Berlin");
    expect(screen.queryByLabelText(/avatar/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[name="expectedVersion"]'))
      .toHaveValue("4");
    expect(document.querySelector('input[name="idempotencyKey"]'))
      .toHaveValue("profile-form-test-0001");
  });
});
