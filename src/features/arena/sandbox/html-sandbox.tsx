/**
 * The renderer for an admin-authored scenario: free-form HTML, CSS and
 * JavaScript, in an iframe that cannot reach the student's session.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ NEVER ADD `allow-same-origin` TO THE SANDBOX ATTRIBUTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sandbox="allow-scripts"` alone gives the frame a unique **opaque origin**.
 * Scripts run — the screen is genuinely interactive, which is the whole
 * requirement — but the document is same-origin with nothing, so it cannot
 * read our cookies, cannot touch `localStorage`, and cannot call the API as the
 * signed-in student.
 *
 * `allow-scripts` and `allow-same-origin` TOGETHER cancel the sandbox. The
 * frame gets our real origin back, keeps script execution, and every line an
 * author typed becomes code running with the student's session. It is the one
 * change in this feature that turns a bug into an account takeover, and it is
 * one word long. FEATURE_BUILD_PLAN §2.1.
 *
 * The list is written out as a literal below rather than composed from a
 * variable so that grepping for `allow-same-origin` in this repository returns
 * this comment and nothing else.
 *
 * ── Why `srcdoc` and not a `blob:` URL or a route ──────────────────────────
 *
 * `srcdoc` keeps the document inline, so there is no second URL a student
 * could open in a top-level tab — where it would NOT be sandboxed and the
 * author's script WOULD run on our origin. A `blob:` URL inherits the creating
 * document's origin, which defeats the point entirely.
 *
 * ── What the frame is deliberately NOT given ───────────────────────────────
 *
 * No `allow-popups`, `allow-modals`, `allow-top-navigation` or
 * `allow-forms`. A scenario that could navigate the top window could replace
 * DiTeLe with a copy of DiTeLe. `allow-forms` is omitted because a form POST
 * from an opaque origin goes nowhere useful anyway and a submit that silently
 * does nothing reads as a planted bug — an author who wants a form should
 * handle `submit` in script, which `allow-scripts` permits.
 *
 * ── The answer key is not here ─────────────────────────────────────────────
 *
 * Only `html` is passed in. The planted-defect list is never sent to the
 * client for an HTML scenario — the bug is already written into the markup, so
 * there is nothing to inject and nothing to disclose. `hunt_scenario_defects`
 * has no learner-readable policy at all (`20260730100000`).
 */

export interface HtmlSandboxProps {
  /**
   * The author's document, already sanitised on save by
   * `app_private.sanitize_scenario_html`. That sanitising is defence in depth,
   * NOT the control — the sandbox attribute is the control. Treat this string
   * as hostile regardless.
   */
  html: string;
  /** Interface string. The accessible name of the frame. */
  title: string;
}

export function HtmlSandbox({ html, title }: HtmlSandboxProps) {
  return (
    <div className="overflow-hidden rounded-(--radius-md) border border-(--color-border) bg-white">
      <iframe
        title={title}
        srcDoc={html}
        sandbox="allow-scripts"
        // `referrerPolicy` so a scenario that fetches something cannot leak
        // which course the student is on through the Referer header.
        referrerPolicy="no-referrer"
        loading="lazy"
        className="block h-[70vh] min-h-100 w-full border-0"
      />
    </div>
  );
}
