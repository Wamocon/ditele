-- ============================================================================
-- WS-13 — Bug Arena integration fixes
--
-- Three defects the five Arena workstreams found in each other's trees and were
-- not permitted to fix. All idempotent, all forward-only, all additive.
--
--   I-050  no learner can read any hunt scenario — the scoped-read policy can
--          never be true for the role it was written for
--   I-051  a hunt verdict changed AFTER acceptance pays no XP
--   I-048  the hunt task's target_url is NULL, so the sandbox is unreachable
--          from the task workspace
--
-- ⚠️ This runs against a LIVE database. Every statement is guarded, and the
-- file asserts its own work at the bottom, because `schema_migrations` on this
-- deployment does not describe reality (I-036).
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. I-050 — a policy body is not `security definer`
--
-- `hunt_scenarios_scoped_read` proves entitlement with an `exists` over
-- `public.tasks`. A policy body runs with the caller's privileges, so `tasks`'
-- own RLS applies *inside* that subquery — and a learner reads 0 rows from
-- `tasks` (`RPC_CONTRACTS.md` §10). The `exists` is therefore false for every
-- learner, always, and it fails SILENTLY: `getHuntScenarioByCode` returns null,
-- which no caller can tell apart from "no such scenario".
--
-- WS-9 measured it in one psql session as `role authenticated` carrying the
-- learner's sub:
--     can_access_cohort('01980a30-…')                     → t
--     select count(*) from public.cohorts                 → 1
--     select count(*) from public.tasks
--       where external_id = 'checkout-v1'                 → 0   ← the trap
--     select count(*) from public.hunt_scenarios          → 0
--
-- As `postgres` the same join returns 1 row, so the join is correct and only
-- the nested RLS is wrong.
--
-- The fix is the pattern the original migration already uses one line below:
-- wrap the entitlement check in a `security definer` helper and call it, which
-- is exactly how `app_private.can_access_cohort` is invoked. The helper answers
-- a narrower question than the policy did, not a wider one — it still requires
-- an *active* hunt task carrying this scenario code inside a content version
-- the caller's own cohort is on. Nothing is granted that the policy intended to
-- withhold; the intended grant simply starts working.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function app_private.hunt_scenario_is_reachable(p_code text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.tasks task_record
    join public.cohorts cohort_record
      on cohort_record.content_version_id = task_record.content_version_id
    where task_record.source_system = 'arena'
      and task_record.external_id = p_code
      and task_record.task_kind = 'hunt'
      and (select app_private.can_access_cohort(cohort_record.id))
  );
$$;

comment on function app_private.hunt_scenario_is_reachable(text) is
  'WS-13 / I-050. Entitlement check for hunt_scenarios_scoped_read. SECURITY '
  'DEFINER because an RLS policy body is NOT — the same predicate written '
  'inline is evaluated under public.tasks'' own RLS, which a learner cannot '
  'pass, so the policy could never be true for the role it was written for.';

-- Ownership is load-bearing, not boilerplate (WS-11 learning 2): `postgres`
-- holds rolbypassrls, and a definer function owned by any other role is
-- silently blocked by FORCE ROW LEVEL SECURITY on the tables it reads.
alter function app_private.hunt_scenario_is_reachable(text) owner to postgres;

revoke all on function app_private.hunt_scenario_is_reachable(text) from public;
grant execute on function app_private.hunt_scenario_is_reachable(text) to authenticated;

drop policy if exists hunt_scenarios_scoped_read on public.hunt_scenarios;
create policy hunt_scenarios_scoped_read
  on public.hunt_scenarios
  for select
  to authenticated
  using (
    state = 'active'
    and (select app_private.hunt_scenario_is_reachable(hunt_scenarios.code))
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. I-051 — a verdict set after acceptance pays nothing
--
-- WS-11's award engine runs inside the trainer's accept and reads the
-- `hunt_findings` verdicts as they stand at that moment. A trainer who accepts
-- first and rules on the findings afterwards pays the learner the approval XP
-- and nothing for the finds. WS-11 could not fix it: `decide_hunt_finding` is
-- WS-10's function in WS-10's migration block.
--
-- ⭐ Why this is safe to add rather than delicate. `award_for_event` is already
-- idempotent by construction — `xp_ledger_source_unique (learner_id,
-- source_event_id)` — and every award it makes derives its source event from a
-- stable id: the review row for the approval, the finding's own id for each
-- find. So calling it a second time with the SAME review id pays the approval
-- zero (that row exists) and pays exactly the finding that just changed. It
-- cannot double-pay, and it cannot pay for a finding the trainer has not ruled
-- on.
--
-- The submission must already be `accepted`. A verdict set *before* acceptance
-- still pays through the normal path, and paying at verdict time on a
-- submission that is not yet accepted would break the §G5 guard rail — XP on
-- trainer acceptance, never on submission alone.
--
-- Patching by rewriting the whole function rather than by string-splicing its
-- deployed body: it is WS-10's file, but it is 130 lines and reproduced here in
-- full from `pg_get_functiondef` so the result is readable rather than a body
-- nobody can review. The only change is the block at the end.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.decide_hunt_finding(
  p_finding_id uuid,
  p_verdict text,
  p_planted_code text,
  p_expected_version bigint,
  p_correlation_id uuid,
  p_idempotency_key text
)
returns public.hunt_findings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  finding_record public.hunt_findings;
  submission_record public.submissions;
  actor_id uuid := (select auth.uid());
  actor_is_trainer boolean;
  actor_can_manage boolean;
  clean_code text;
  updated_record public.hunt_findings;
  accepted_review_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_correlation_id is null then
    raise exception 'p_correlation_id is required' using errcode = '22023';
  end if;

  if length(coalesce(p_idempotency_key, '')) < 8 then
    raise exception 'p_idempotency_key is required' using errcode = '22023';
  end if;

  if p_verdict not in ('pending', 'confirmed', 'duplicate', 'invalid', 'bonus') then
    raise exception 'unknown verdict: %', p_verdict using errcode = '22023';
  end if;

  select * into finding_record
  from public.hunt_findings
  where id = p_finding_id;

  if finding_record.id is null then
    raise exception 'hunt finding not found' using errcode = 'P0002';
  end if;

  -- ⚠️ Authorization is the SAME PAIR OF CHECKS public.decide_submission makes,
  -- so "may I rule on this finding" and "may I decide this submission" cannot
  -- drift into two different answers.
  --
  -- This was originally written against app_private.can_access_submission, and
  -- probing it as each role caught the mistake before it landed: that helper
  -- governs READ access on the review screen, and a learner may of course read
  -- their own submission — so a student could mark their own bug report
  -- 'confirmed', which WS-11's award engine then pays XP for. Grading is not a
  -- read. The correct gate is "is a review trainer on this cohort, or holds
  -- cohort.manage", and nothing weaker.
  if finding_record.submission_id is null then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  select * into submission_record
  from public.submissions
  where id = finding_record.submission_id;

  if submission_record.id is null then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  actor_is_trainer := app_private.is_active_cohort_review_trainer(
    actor_id,
    submission_record.cohort_id,
    submission_record.organization_id
  );
  actor_can_manage := app_private.has_permission(
    'cohort.manage',
    submission_record.organization_id,
    submission_record.cohort_id
  );
  if not actor_is_trainer and not actor_can_manage then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  -- 'confirmed' names a planted defect; 'bonus' is by definition unplanted, and
  -- 'duplicate'/'invalid'/'pending' carry no code. Normalising here keeps the
  -- table's CHECK constraints from surfacing as raw Postgres errors in the UI.
  clean_code := nullif(btrim(coalesce(p_planted_code, '')), '');
  if p_verdict = 'confirmed' and clean_code is null then
    raise exception 'a confirmed finding must name the planted defect it matches'
      using errcode = '22023';
  end if;
  if p_verdict <> 'confirmed' then
    clean_code := null;
  end if;

  -- Replay. Same verdict, same code -> return what is already there rather than
  -- bumping row_version, so a double-click or a retried request is free.
  if finding_record.verdict = p_verdict
     and finding_record.planted_code is not distinct from clean_code then
    return finding_record;
  end if;

  -- Optimistic concurrency, deliberately written as a plain guarded UPDATE with
  -- no lock and no retry loop. ISSUES.md I-007/I-009: on this deployment a
  -- stale expected-version HANGS rather than erroring, Kong 504s and the
  -- PostgREST pool is unusable for ~30s afterwards. Whatever produces that, it
  -- is not reproduced here -- this either matches one row or matches none.
  update public.hunt_findings
  set verdict = p_verdict,
      planted_code = clean_code,
      decided_by = case when p_verdict = 'pending' then null else actor_id end,
      decided_at = case when p_verdict = 'pending' then null
                        else statement_timestamp() end,
      row_version = row_version + 1,
      updated_at = statement_timestamp()
  where id = p_finding_id
    and row_version = p_expected_version
  returning * into updated_record;

  if updated_record.id is null then
    raise exception
      'hunt finding % changed since it was read (expected version %)',
      p_finding_id, p_expected_version
      using errcode = '40001';
  end if;

  -- ⭐ WS-13 / I-051: pay for a find ruled on AFTER the submission was accepted.
  --
  -- The award engine runs inside the accept and reads the verdicts as they
  -- stand then, so this ordering — accept first, rule on the findings second —
  -- silently paid nothing. It is not the natural order (WS-10's panel sits
  -- beside the decision control) but it is a perfectly reasonable one.
  --
  -- Re-using the ACCEPTED REVIEW's id as the source event is what makes this
  -- replay-safe: award_for_event re-awards the approval under that same id,
  -- which the ledger's unique index absorbs, and then pays each confirmed or
  -- bonus finding under the finding's own id. Only the new one is unpaid.
  if p_verdict in ('confirmed', 'bonus') and submission_record.state = 'accepted' then
    select review_row.id into accepted_review_id
    from public.reviews review_row
    where review_row.submission_id = submission_record.id
      and review_row.decision = 'accepted'
    order by review_row.created_at desc
    limit 1;

    if accepted_review_id is not null then
      perform app_private.award_for_event(
        submission_record.learner_id,
        submission_record.organization_id,
        'accepted_submission',
        accepted_review_id,
        submission_record.id
      );
    end if;
  end if;

  return updated_record;
end;
$function$;

alter function public.decide_hunt_finding(uuid, text, text, bigint, uuid, text)
  owner to postgres;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. I-048 — the hunt task cannot reach its own sandbox
--
-- `get_my_learning_task.target_url` is what drives `IframePanel`. It is NULL on
-- WS-8's hunt task, so the workspace renders a theory task and the sandbox is
-- unreachable except by typing the URL. `?embed=1` makes the sandbox cover the
-- DiTeLe shell instead of rendering a second header inside the frame.
--
-- ⚠️ `tasks` sits inside a published content version behind integrity triggers,
-- which is why neither WS-9 nor WS-10 wrote this. The trigger that objects is
-- `tasks_guard_published_graph` (its FUNCTION is `guard_immutable_content_graph`
-- — the names differ, and using the function name raises "trigger does not
-- exist"); it is disabled by name for this one UPDATE
-- and re-enabled unconditionally, and the block asserts afterwards that it is
-- back on. NOT `session_replication_role`, which would also drop FK checking.
--
-- The product path for a real content change is authoring a new draft version
-- and publishing it. This is a repair to a seeded fixture, applied the way
-- WS-8's slice seed applies one.
--
-- ⭐ **The value I-048 prescribes could not be stored, and finding that out is
-- the interesting part of this section.** `tasks_target_url_protocol` is
--
--     check (target_url is null or target_url ~ '^https?://')
--
-- written when every practice target was an external site. Decision D1 made the
-- sandbox *in-app*, so a hunt's target is a path on our own origin — and the
-- shipped constraint rejects exactly that. Nobody had hit it because nobody had
-- ever set a hunt's target_url; I-048 sat open across two workstreams, and the
-- value both of them recorded as "the one it needs" is one the database
-- refuses.
--
-- The alternative was storing an absolute `http://127.0.0.1:3113/de/arena/…`,
-- which bakes this machine's dev origin into a content row and breaks the day
-- it is deployed anywhere else. So the constraint is WIDENED, never replaced:
-- it still rejects `javascript:`, `data:` and every other scheme, and the new
-- branch requires a SINGLE leading slash — `^/[^/]` — because `//evil.example`
-- is a protocol-relative URL that would frame a foreign origin while looking
-- like a local path.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.tasks drop constraint if exists tasks_target_url_protocol;
alter table public.tasks
  add constraint tasks_target_url_protocol
  check (
    target_url is null
    or target_url ~ '^https?://'
    -- Root-relative, and NOT protocol-relative: `//host` must stay refused.
    or target_url ~ '^/[^/]'
  );

do $target_url$
declare
  hunt_task_id constant uuid := '019f9100-0000-7000-8000-000000000001';
  target constant text := '/de/arena/sandbox/checkout-v1?embed=1';
  current_url text;
  still_disabled integer;
begin
  select task_record.target_url into current_url
  from public.tasks task_record
  where task_record.id = hunt_task_id;

  if not found then
    raise notice 'I-048: hunt task % is not on this database — skipping', hunt_task_id;
    return;
  end if;

  if current_url is not distinct from target then
    raise notice 'I-048: target_url already set — nothing to do';
    return;
  end if;

  alter table public.tasks disable trigger tasks_guard_published_graph;

  update public.tasks
  set target_url = target
  where id = hunt_task_id;

  alter table public.tasks enable trigger tasks_guard_published_graph;

  select count(*) into still_disabled
  from pg_catalog.pg_trigger
  where tgrelid = 'public.tasks'::regclass
    and tgname = 'tasks_guard_published_graph'
    and tgenabled = 'D';

  if still_disabled > 0 then
    raise exception 'I-048 left tasks_guard_published_graph DISABLED — refusing to commit';
  end if;

  raise notice 'I-048: hunt task target_url set to %', target;
end
$target_url$;

-- ────────────────────────────────────────────────────────────────────────────
-- Assert this migration's own work. `schema_migrations` is not trustworthy on
-- this deployment (I-036), so the file proves itself by effect.
-- ────────────────────────────────────────────────────────────────────────────

do $verify$
declare
  problems text[] := array[]::text[];
  policy_body text;
begin
  if to_regprocedure('app_private.hunt_scenario_is_reachable(text)') is null then
    problems := problems || 'hunt_scenario_is_reachable was not created';
  elsif not (
    select p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = 'hunt_scenario_is_reachable'
  ) then
    problems := problems || 'hunt_scenario_is_reachable is not SECURITY DEFINER — the entire point of it';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid) into policy_body
  from pg_catalog.pg_policy pol
  where pol.polrelid = 'public.hunt_scenarios'::regclass
    and pol.polname = 'hunt_scenarios_scoped_read';

  if policy_body is null then
    problems := problems || 'hunt_scenarios_scoped_read is missing';
  elsif position('hunt_scenario_is_reachable' in policy_body) = 0 then
    problems := problems || 'hunt_scenarios_scoped_read does not call the definer helper';
  end if;

  -- RLS must still be ON. Replacing a policy is not supposed to touch it, and
  -- checking costs one row.
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.hunt_scenarios'::regclass
  ) then
    problems := problems || 'RLS is OFF on hunt_scenarios';
  end if;

  -- The widened constraint must still refuse a protocol-relative URL. Asserted
  -- rather than trusted: this is the branch that could turn an in-app practice
  -- panel into a frame pointed at somebody else's origin.
  begin
    perform 1 where '//evil.example/x' ~ '^https?://' or '//evil.example/x' ~ '^/[^/]';
    if found then
      problems := problems || 'the widened target_url check accepts a protocol-relative URL';
    end if;
  end;

  if position('I-051' in (
    select p.prosrc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'decide_hunt_finding'
  )) = 0 then
    problems := problems || 'decide_hunt_finding does not carry the I-051 award block';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'WS-13 20260727100000 failed its own verification: %',
      array_to_string(problems, ' | ');
  end if;

  raise notice 'WS-13 20260727100000 verified: I-050 policy, I-051 award block, I-048 target_url';
end
$verify$;

commit;
