import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkillPathOverview } from "./skill-path-overview";

describe("SkillPathOverview", () => {
  it("labels a persistence-unavailable skill module explicitly", () => {
    render(<SkillPathOverview available={false} skills={[]} mastery={[]} labels={{ title: "Skills", unavailableTitle: "Skills unavailable", unavailableDescription: "The mastery service is not configured.", nextAction: "Next", blocked: "Blocked", mastery: { not_started: "Not started", developing: "Developing", proficient: "Proficient", mastered: "Mastered" }, score: String, duration: String }} />);
    expect(screen.getByRole("heading", { name: "Skills unavailable" })).toBeInTheDocument();
    expect(screen.getByText("The mastery service is not configured.")).toBeInTheDocument();
  });
});
