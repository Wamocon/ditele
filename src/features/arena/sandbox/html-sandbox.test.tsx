import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { HtmlSandbox } from "./html-sandbox";

/**
 * These assert one thing and it is not a rendering detail: that the frame
 * holding admin-authored JavaScript keeps a unique opaque origin.
 *
 * `allow-scripts` alone does that. `allow-scripts` **plus** `allow-same-origin`
 * cancels the sandbox entirely — the frame gets our real origin back, keeps
 * script execution, and every line an author typed can read the student's
 * cookies and call the API as them. FEATURE_BUILD_PLAN §2.1 calls it the one
 * change in this feature that turns a bug into an account takeover.
 *
 * It is one word long, it looks harmless in a diff, and nothing else in the
 * application would fail if somebody added it — the scenario would keep
 * rendering, the tests would keep passing, and the hole would ship. Hence a
 * test whose only job is to fail loudly at exactly that moment.
 */
describe("HtmlSandbox", () => {
  const frame = (html: string) =>
    render(<HtmlSandbox html={html} title="Testumgebung" />).container.querySelector("iframe");

  it("sandboxes the frame with allow-scripts and nothing else", () => {
    const iframe = frame("<p>hallo</p>");
    expect(iframe).not.toBeNull();
    // Exact string equality, not `toContain`. `toContain("allow-scripts")` is
    // satisfied by "allow-scripts allow-same-origin", which is the failure.
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("never grants allow-same-origin", () => {
    const tokens = frame("<p>hallo</p>")?.getAttribute("sandbox")?.split(/\s+/) ?? [];
    expect(tokens).not.toContain("allow-same-origin");
  });

  it("grants no escape hatch that could reach the top window", () => {
    const tokens = frame("<p>hallo</p>")?.getAttribute("sandbox")?.split(/\s+/) ?? [];
    // A scenario that can navigate the top window can replace DiTeLe with a
    // copy of DiTeLe; one that can open a popup can do it in a new tab.
    expect(tokens).not.toContain("allow-top-navigation");
    expect(tokens).not.toContain("allow-top-navigation-by-user-activation");
    expect(tokens).not.toContain("allow-popups");
    expect(tokens).not.toContain("allow-modals");
  });

  it("carries the document inline via srcdoc, never as a navigable URL", () => {
    const iframe = frame("<p>hallo</p>");
    // A `src` would be a second URL the student could open top-level, where it
    // would not be sandboxed at all. A blob: URL inherits the creating
    // document's origin, which defeats the sandbox the same way.
    expect(iframe?.getAttribute("srcdoc")).toBe("<p>hallo</p>");
    expect(iframe?.getAttribute("src")).toBeNull();
  });

  it("passes the author's markup through untouched", () => {
    // Sanitising happens once, on save, in the database
    // (app_private.sanitize_scenario_html). Doing it again here would be a
    // second, divergent implementation of the same rule — and the sandbox, not
    // the sanitiser, is the control.
    const hostile = '<script>window.top.location="https://evil.example"</script>';
    expect(frame(hostile)?.getAttribute("srcdoc")).toBe(hostile);
  });

  it("does not leak the referrer to anything the scenario fetches", () => {
    expect(frame("<p>x</p>")?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});
