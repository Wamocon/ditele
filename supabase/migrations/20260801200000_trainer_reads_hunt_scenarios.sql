-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 4 — a trainer can see the hunts they are about to grade.
--
-- `public.hunt_scenarios` had exactly two policies that admit a SELECT:
--
--   hunt_scenarios_scoped_read   state = 'active'
--                                AND app_private.hunt_scenario_is_reachable(code)
--   hunt_scenarios_content_write FOR ALL, requiring 'content.manage'
--                                (a FOR ALL policy covers SELECT too)
--
-- Neither admits a trainer. `hunt_scenario_is_reachable` asks "is this scenario
-- referenced by a task in a cohort the CALLER can access" — it is the learner's
-- question, and a trainer is not enrolled on the cohort. `content.manage` is
-- the authoring permission, which trainers deliberately do not hold.
--
-- Measured rather than reasoned about: over the API, with real JWTs,
--
--     trainer@ditele.local  reads  [checkout-v1]
--     admin@ditele.local    reads  [checkout-v1, wartungsportal-v1]
--
-- and `checkout-v1` only appears for the trainer by accident — a seeded hunt
-- task happens to point at it, and `can_access_cohort` lets the trainer through
-- that path. A scenario an admin authored this morning, which no task points at
-- yet, is invisible to every trainer.
--
-- The effect was that `/trainer/arena` — the whole point of which is to let a
-- trainer read the planted-defect list BEFORE the review queue — rendered an
-- empty list, silently. RLS does not raise; it returns zero rows, so the page
-- looked like "no hunts exist" rather than "you may not see these".
--
-- Note the asymmetry this fixes. `hunt_scenario_defects` — the ANSWER KEY, the
-- more sensitive of the two — already admitted `review.manage` when it was
-- created in `20260730100000`. The scenario row it hangs off did not. So a
-- trainer could read the defects and not the scenario they belong to, which is
-- the wrong way round and made the join return nothing.
--
-- Scoped to `review.manage` on the scenario's own organisation, and to ACTIVE
-- scenarios only: a draft is an author's work in progress and a trainer
-- preparing for a queue should not be reading hunts no learner can be sent.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists hunt_scenarios_review_read on public.hunt_scenarios;
create policy hunt_scenarios_review_read
  on public.hunt_scenarios for select to authenticated
  using (
    state = 'active'
    and (select app_private.has_permission('review.manage', organization_id, null))
  );

comment on policy hunt_scenarios_review_read on public.hunt_scenarios is
  'A trainer reads active scenarios so /trainer/arena can show the planted '
  'defects before the review queue. hunt_scenario_defects already admitted '
  'review.manage; this closes the asymmetry.';

commit;

-- ─── Verification, by effect and under the trainer's own identity ─────────
do $verify$
declare
  trainer_id uuid;
  visible integer;
  draft_visible integer;
  scenario_organization uuid;
begin
  select user_role.user_id into trainer_id
  from public.user_roles user_role
  join public.roles role_record on role_record.id = user_role.role_id
  where role_record.code = 'trainer' and user_role.revoked_at is null
  limit 1;

  if trainer_id is null then
    raise notice 'no trainer account; behavioural check skipped';
    return;
  end if;

  select scenario_record.organization_id into scenario_organization
  from public.hunt_scenarios scenario_record
  where scenario_record.state = 'active'
  limit 1;

  -- The policy is what is under test, so the check runs as `authenticated`
  -- with the trainer's claims — running it as the owner would bypass RLS
  -- entirely and pass no matter what the policy said.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', trainer_id, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select count(*) into visible from public.hunt_scenarios;
  select count(*) into draft_visible
  from public.hunt_scenarios where state <> 'active';

  reset role;

  if visible < 1 then
    raise exception 'a trainer still reads no scenarios' using errcode = '55000';
  end if;
  if draft_visible <> 0 then
    raise exception
      'a trainer can read % non-active scenario(s); the policy is too wide',
      draft_visible using errcode = '55000';
  end if;

  raise notice 'trainer reads % active scenario(s) and 0 drafts', visible;
end
$verify$;
