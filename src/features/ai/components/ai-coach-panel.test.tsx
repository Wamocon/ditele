import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiCoachPanel } from "./ai-coach-panel";

describe("AiCoachPanel", () => {
  it("shows an answer-leakage refusal without answer content", () => {
    render(<AiCoachPanel outcome={{ status: "refused", reason: "answer_leakage", escalationRecommended: true }} labels={{ title: "Coach", idleDescription: "Ask for help", refused: "Request refused", unavailable: "Unavailable", citations: "Sources" }} />);
    expect(screen.getByRole("heading", { name: "Request refused" })).toBeInTheDocument();
    expect(screen.getByText("answer_leakage")).toBeInTheDocument();
  });
});
