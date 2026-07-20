import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EntitlementGate } from "./entitlement-gate";

const labels = {
  not_entitled: { title: "Access unavailable", description: "No entitlement." },
  expired: { title: "Access expired", description: "Renew access." },
  suspended: { title: "Access suspended", description: "Contact support." },
  package_unavailable: { title: "Package unavailable", description: "This package is not live." },
};

describe("EntitlementGate", () => {
  it("does not render protected children for an unavailable package", () => {
    render(<EntitlementGate decision={{ allowed: false, reason: "package_unavailable" }} labels={labels}><p>Protected lab</p></EntitlementGate>);
    expect(screen.queryByText("Protected lab")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Package unavailable" })).toBeInTheDocument();
  });
});
