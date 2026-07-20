import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatePanel } from "./state-panel";

describe("StatePanel", () => {
  it("gives every co-located status region a unique accessible name", () => {
    render(
      <>
        <StatePanel description="Nothing is assigned." title="Empty" />
        <StatePanel description="Writes are disabled." title="Read only" />
      </>,
    );

    const regions = screen.getAllByRole("region");
    expect(regions).toHaveLength(2);
    expect(regions[0]).toHaveAccessibleName("Empty");
    expect(regions[1]).toHaveAccessibleName("Read only");
    expect(regions[0]?.getAttribute("aria-labelledby")).not.toBe(
      regions[1]?.getAttribute("aria-labelledby"),
    );
  });
});
