import type { Metadata } from "next";
import { EmptyState, ErrorState } from "@/shared/ui";
import { getHuntScenarioByCode } from "@/shared/data/arena";
import { isAuthoringEnabled } from "@/features/arena/sandbox/authoring";
import { sandboxStrings } from "@/features/arena/sandbox/i18n";
import { parseScenarioConfiguration } from "@/features/arena/sandbox/model";
import { registryMismatches } from "@/features/arena/sandbox/registry";
import { getDraftScenario } from "@/features/arena/sandbox/scenarios";
import { HtmlSandbox } from "@/features/arena/sandbox/html-sandbox";
import { SandboxFrame } from "@/features/arena/sandbox/sandbox-frame";
import { SandboxRuntime } from "@/features/arena/sandbox/sandbox-runtime";
import { KNOWN_SURFACES } from "@/features/arena/sandbox/surface-effects";

/**
 * ⭐ The Bug Arena sandbox — the application under test.
 *
 * `[scenarioId]` is the scenario **code** (`checkout-v1`), not a uuid: a hunt
 * task points at a scenario through `tasks.source_system = 'arena'` +
 * `tasks.external_id`, and that handle is the code. Pointing a hunt at a
 * different scenario stays a content edit rather than a migration, which is
 * the whole reason the link is a string.
 *
 * Query parameters:
 *  - `?embed=1`   — rendered inside the task workspace's frame. Covers the
 *                   DiTeLe shell; see `SandboxFrame`.
 *  - `?defects=off` — author-only, gated by `DITELE_ARENA_AUTHORING`. The
 *                   clean baseline render.
 *
 * A Server Component that fetches, validates and hands off. Everything
 * interactive is below `SandboxRuntime`.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; scenarioId: string }>;
}): Promise<Metadata> {
  const { locale, scenarioId } = await params;
  const s = sandboxStrings(locale);
  return {
    title: `${s.frameLabel} · ${scenarioId} · DiTeLe`,
    // Behind auth already, but a sandbox full of deliberately wrong prices is
    // the last thing that should turn up in a search result.
    robots: { index: false, follow: false },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; scenarioId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, scenarioId } = await params;
  const query = await searchParams;
  const s = sandboxStrings(locale);

  const authoring = isAuthoringEnabled();
  const embedded = query.embed === "1";
  const defectsEnabled = !(authoring && query.defects === "off");
  // `?draft=1` renders a scenario straight from `scenarios/*.json`, with no
  // database involved, so an author can iterate before seeding. Author-only:
  // outside authoring mode the flag is ignored entirely, so a learner cannot
  // reach a draft even by guessing its code.
  const useDraft = authoring && query.draft === "1";

  /** Only the fields this route needs, from either source. */
  let scenario: {
    code: string;
    scenarioVersion: number;
    description: string;
    configuration: unknown;
    /**
     * Phase 1c. Non-null means an ADMIN wrote this screen by hand and it is
     * rendered as free-form HTML in a sandboxed iframe instead of by the
     * component-registry engine. A draft from `scenarios/*.json` never has one.
     */
    html?: string | null;
  } | null;

  if (useDraft) {
    scenario = getDraftScenario(scenarioId);
  } else {
    const result = await getHuntScenarioByCode(scenarioId);
    if (!result.ok) {
      return <ErrorState title={s.loadErrorTitle} error={result.error} locale={locale} />;
    }
    // ⭐ The I-050 fallback is GONE, and with it the scope it cost.
    //
    // WS-9 shipped `result.data ?? getDraftScenario(scenarioId)` because
    // `hunt_scenarios_scoped_read` could never be true for a learner — a policy
    // body is not `security definer`, so its `exists` over `public.tasks` was
    // evaluated under `tasks`' own RLS, which a learner does not pass. The
    // seeded row was invisible to exactly the people it was for, and it failed
    // silently: the read returned null, which is indistinguishable from "no
    // such scenario".
    //
    // The price of that fallback was that ANY signed-in learner could render
    // ANY shipped scenario by guessing its code. WS-13's `20260727100000`
    // moves the check into `app_private.hunt_scenario_is_reachable`, and
    // `scripts/ws13-integration-probe.sql` §1–§2 measure both halves: the
    // enrolled learner reads the scenario (while still reading 0 tasks), and an
    // unenrolled one reads nothing.
    //
    // So the database is the only source now, and `null` means what it says.
    scenario = result.data;
  }

  if (!scenario) {
    // Not a 404 on purpose. RLS scopes this read to active scenarios in a
    // cohort the learner can reach, so "no such scenario" and "not yours" are
    // deliberately the same answer — and a hard 404 rendered inside the task
    // workspace's frame would look like the platform had broken, which is the
    // one impression this feature cannot afford to give.
    return <EmptyState title={s.notFoundTitle} description={s.notFoundDescription} />;
  }

  /**
   * ⭐ The HTML branch, and it must come BEFORE the configuration parse.
   *
   * An admin-authored scenario has no `surfaces[]` — the bug is written into
   * the markup by hand, not injected by the engine — so
   * `parseScenarioConfiguration` correctly rejects it as misconfigured. Running
   * that parse first would send every HTML scenario to the "this scenario is
   * broken" error state, which is exactly the impression §2.2 says this
   * feature cannot afford to give.
   *
   * The two modes are mutually exclusive and the database enforces it for an
   * active scenario (`hunt_scenarios_one_render_mode`), so this is a real fork
   * rather than a fallback.
   */
  const authoredHtml = typeof scenario.html === "string" ? scenario.html.trim() : "";
  if (authoredHtml !== "") {
    return (
      <SandboxFrame
        strings={s}
        scenarioCode={scenario.code}
        scenarioVersion={scenario.scenarioVersion}
        // The scenario's own German title is the app name here; an HTML
        // scenario has no `configuration.appName` to read.
        appName=""
        description={scenario.description}
        defectsEnabled={defectsEnabled}
        authoring={authoring}
        embedded={embedded}
      >
        <HtmlSandbox html={authoredHtml} title={s.frameLabel} />
      </SandboxFrame>
    );
  }

  const { configuration, errors } = parseScenarioConfiguration(
    scenario.configuration,
    KNOWN_SURFACES,
  );
  const problems = [...errors, ...registryMismatches()];

  if (!configuration || problems.length > 0) {
    // A misconfigured scenario renders nothing at all. A half-rendered sandbox
    // is indistinguishable from a planted bug, and every such confusion costs
    // a trainer a real review — the exact cost decision D2 exists to control.
    return (
      <ErrorState
        title={s.configErrorTitle}
        message={authoring ? problems.join(" · ") : s.configErrorDescription}
        locale={locale}
      />
    );
  }

  return (
    <SandboxFrame
      strings={s}
      scenarioCode={scenario.code}
      scenarioVersion={scenario.scenarioVersion}
      appName={configuration.appName}
      description={scenario.description}
      defectsEnabled={defectsEnabled}
      authoring={authoring}
      embedded={embedded}
    >
      <SandboxRuntime
        configuration={configuration}
        defectsEnabled={defectsEnabled}
        strings={s}
      />
    </SandboxFrame>
  );
}
