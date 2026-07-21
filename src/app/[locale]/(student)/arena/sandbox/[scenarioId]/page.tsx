import type { Metadata } from "next";
import { EmptyState, ErrorState } from "@/shared/ui";
import { getHuntScenarioByCode } from "@/shared/data/arena";
import { isAuthoringEnabled } from "@/features/arena/sandbox/authoring";
import { sandboxStrings } from "@/features/arena/sandbox/i18n";
import { parseScenarioConfiguration } from "@/features/arena/sandbox/model";
import { registryMismatches } from "@/features/arena/sandbox/registry";
import { getDraftScenario } from "@/features/arena/sandbox/scenarios";
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

  /** Only the four fields this route needs, from either source. */
  let scenario: {
    code: string;
    scenarioVersion: number;
    description: string;
    configuration: unknown;
  } | null;

  if (useDraft) {
    scenario = getDraftScenario(scenarioId);
  } else {
    const result = await getHuntScenarioByCode(scenarioId);
    if (!result.ok) {
      return <ErrorState title={s.loadErrorTitle} message={result.error.message} locale={locale} />;
    }
    // ⚠️ The fallback is a WORKAROUND for ISSUES.md I-050, and it is load-
    // bearing today: `hunt_scenarios_scoped_read` proves the learner may see
    // the scenario by joining through `public.tasks`, but a learner reads ZERO
    // rows from `tasks` under its own RLS (RPC_CONTRACTS §10), so the `exists`
    // is false for every learner and the seeded row is invisible to exactly
    // the people it is for. Measured, not guessed: `can_access_cohort` returns
    // true and `select count(*) from tasks` returns 0 in the same session.
    //
    // So the shipped definition renders instead. It cannot drift from the row:
    // `seed_arena_scenarios.sql` is generated from the same file and
    // `scripts/ws9-check-scenario.mjs` diffs the two. The database row stays
    // the ground truth for grading, which is what WS-10 reads it for.
    //
    // What it costs: any signed-in learner can render any shipped scenario by
    // guessing its code, rather than only the ones their cohort reaches. A
    // sandbox is a fake shop with no learner data in it, so this leaks nothing
    // — but it is a real narrowing of scope that WS-8's policy was meant to
    // enforce. **Delete this branch the day I-050 is fixed**, and the intended
    // path is already there above it.
    scenario = result.data ?? getDraftScenario(scenarioId);
  }

  if (!scenario) {
    // Not a 404 on purpose. RLS scopes this read to active scenarios in a
    // cohort the learner can reach, so "no such scenario" and "not yours" are
    // deliberately the same answer — and a hard 404 rendered inside the task
    // workspace's frame would look like the platform had broken, which is the
    // one impression this feature cannot afford to give.
    return <EmptyState title={s.notFoundTitle} description={s.notFoundDescription} />;
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
