import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LabStatusPanel } from "./lab-status-panel";

const states = { requested: "Requested", provisioning: "Provisioning", ready: "Ready", active: "Active", validating: "Validating", reset_pending: "Reset pending", destroy_pending: "Destroy pending", destroyed: "Destroyed", failed: "Failed", expired: "Expired" } as const;

describe("LabStatusPanel", () => {
  it("renders a not-configured provider as unavailable rather than live", () => {
    render(<LabStatusPanel availability={{ available: false, reason: "not_configured" }} labels={{ title: "Lab", unavailableTitle: "Lab unavailable", unavailable: { not_configured: "No provider is configured.", temporarily_unavailable: "Try later.", capacity_exhausted: "Capacity reached." }, states }} />);
    expect(screen.getByRole("heading", { name: "Lab unavailable" })).toBeInTheDocument();
    expect(screen.getByText("No provider is configured.")).toBeInTheDocument();
  });
});
