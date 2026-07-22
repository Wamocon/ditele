-- ═══════════════════════════════════════════════════════════════════════════
-- An Arena scenario may carry a badge — optionally.
--
-- Every badge in the product is a THRESHOLD badge: `app_private.
-- evaluate_badge_rules` counts confirmed findings or approved submissions and
-- awards when a number is reached. There was no way to say "finishing THIS
-- hunt earns THIS badge", so an author who built a set-piece scenario had
-- nothing to attach to it.
--
-- Optional on purpose. Most hunts will carry no badge — one per task would
-- make the wall of badges meaningless, which is the failure mode a reward
-- system has. `reward_badge_id is null` is the normal case and stays the
-- default.
--
-- Also drops `p_start_media_url` / `p_end_media_url` from the authoring
-- signature. The two columns have been written by the admin form since it
-- shipped and read by nothing, anywhere — no learner screen renders them. The
-- columns are LEFT IN PLACE: dropping a column is irreversible and these hold
-- whatever an author has already typed. They are simply no longer written.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The column ─────────────────────────────────────────────────────────
-- `on delete restrict`, matching `badge_awards.badge_id`: a badge that a
-- scenario promises must not vanish out from under it. Retiring a badge is
-- `state = 'archived'`, which is what the catalogue's own state column is for.

alter table public.hunt_scenarios
  add column if not exists reward_badge_id uuid
    references public.badges (id) on delete restrict;

create index if not exists hunt_scenarios_reward_badge_idx
  on public.hunt_scenarios (reward_badge_id)
  where reward_badge_id is not null;

comment on column public.hunt_scenarios.reward_badge_id is
  'Optional. Awarded once when a submission for this hunt is accepted. Null — '
  'the normal case — means the hunt pays XP only.';

comment on column public.hunt_scenarios.start_media_url is
  'Unused. Written by the admin form until 20260804100000 and never read by '
  'any screen; kept so existing values are not destroyed.';
comment on column public.hunt_scenarios.end_media_url is
  'Unused. See start_media_url.';

-- ─── 2. Authoring: badge in, media out ─────────────────────────────────────
-- Dropped rather than replaced. `create or replace` with a different argument
-- list creates a second overload, and PostgREST resolving by named arguments
-- would then have two candidates and reject the call as ambiguous.

drop function if exists public.upsert_hunt_scenario(
  text, text, text, text, integer, text, text, public.record_state, uuid, uuid
);

create function public.upsert_hunt_scenario(
  p_code text,
  p_title text,
  p_description text,
  p_html text default null,
  p_expected_findings integer default null,
  p_reward_badge_id uuid default null,
  p_state public.record_state default 'draft',
  p_organization_id uuid default null,
  p_correlation_id uuid default null
) returns public.hunt_scenarios
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  resolved_organization_id uuid := p_organization_id;
  scenario_row public.hunt_scenarios;
  planted_count integer;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_code), '') is null or p_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'upsert_hunt_scenario: code must look like my-scenario-v1'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_title), '') is null then
    raise exception 'upsert_hunt_scenario: a title is required' using errcode = '22023';
  end if;

  -- Caught here rather than as a raw 23503 from the foreign key, so the author
  -- gets a sentence about the badge instead of a constraint name.
  if p_reward_badge_id is not null
     and not exists (select 1 from public.badges badge_record
                     where badge_record.id = p_reward_badge_id) then
    raise exception 'upsert_hunt_scenario: no such badge' using errcode = '22023';
  end if;

  select scenario_record.* into scenario_row
  from public.hunt_scenarios scenario_record
  where scenario_record.code = p_code
  order by scenario_record.scenario_version desc
  limit 1;

  if resolved_organization_id is null then
    resolved_organization_id := scenario_row.organization_id;
  end if;
  if resolved_organization_id is null then
    select (array_agg(membership.organization_id
                      order by membership.organization_id))[1]
    into resolved_organization_id
    from public.organization_memberships membership
    where membership.user_id = actor_id
      and membership.state = 'active'
      and membership.removed_at is null
    having count(*) = 1;
  end if;

  if not (select app_private.has_permission(
    'content.manage', resolved_organization_id, null
  )) then
    raise exception 'upsert_hunt_scenario: content administration denied'
      using errcode = '42501';
  end if;

  -- expected_findings defaults to the number of planted defects actually
  -- recorded. A hand-typed number that disagrees with the answer key makes
  -- "3 von 5 gefunden" a lie in one direction or the other.
  select count(*) into planted_count
  from public.hunt_scenario_defects defect_record
  where defect_record.scenario_id = scenario_row.id;

  if scenario_row.id is null then
    insert into public.hunt_scenarios (
      organization_id, code, scenario_version, title, description,
      html, expected_findings, reward_badge_id, state
    ) values (
      resolved_organization_id, p_code, 1, btrim(p_title),
      coalesce(p_description, ''),
      app_private.sanitize_scenario_html(p_html),
      coalesce(p_expected_findings, 0), p_reward_badge_id, p_state
    )
    returning * into scenario_row;
  else
    update public.hunt_scenarios scenario_record
    set title = btrim(p_title),
        description = coalesce(p_description, scenario_record.description),
        html = app_private.sanitize_scenario_html(p_html),
        -- Assigned unconditionally, not coalesced: the picker has a "no badge"
        -- option, and coalescing would make that option do nothing — an author
        -- could attach a badge but never take one off.
        reward_badge_id = p_reward_badge_id,
        expected_findings =
          coalesce(p_expected_findings, planted_count,
                   scenario_record.expected_findings),
        state = p_state,
        organization_id = resolved_organization_id,
        updated_at = statement_timestamp()
    where scenario_record.id = scenario_row.id
    returning * into scenario_row;
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    resolved_organization_id, actor_id, 'admin', 'hunt_scenario.saved',
    'hunt_scenario', scenario_row.id, scenario_row.row_version, correlation_id,
    jsonb_build_object('code', p_code, 'state', p_state,
                       'reward_badge_id', p_reward_badge_id,
                       'render_mode',
                       case when scenario_row.html is null
                         then 'registry' else 'html' end)
  );

  return scenario_row;
end;
$function$;

comment on function public.upsert_hunt_scenario is
  'Creates or updates a hunt scenario. p_reward_badge_id is optional and is '
  'assigned unconditionally so that clearing it in the form clears it in the '
  'row. The start/end media arguments were removed in 20260804100000: nothing '
  'ever rendered them.';

grant execute on function public.upsert_hunt_scenario(
  text, text, text, text, integer, uuid, public.record_state, uuid, uuid
) to authenticated;

-- ─── 3. Awarding it ────────────────────────────────────────────────────────
-- A hunt is finished when the trainer accepts the submission for it, which is
-- the same moment `award_for_event` already pays the XP. So this hangs off the
-- existing entry point rather than inventing a second award path that could
-- disagree with the first about when a hunt counts as done.

create or replace function app_private.award_scenario_badge(
  p_learner_id uuid,
  p_organization_id uuid,
  p_submission_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $scenario_badge$
declare
  badge_row record;
  award_key uuid;
  inserted integer;
begin
  if p_learner_id is null or p_submission_id is null then
    return null;
  end if;

  -- The link is `tasks.source_system = 'arena'` + `tasks.external_id = code`,
  -- the same join `app_private.hunt_scenario_is_reachable` uses. Newest
  -- scenario version wins, matching how the learner's sandbox resolves a code.
  select badge_record.id, badge_record.code, badge_record.labels
  into badge_row
  from public.submissions submission_record
  join public.tasks task_record
    on task_record.id = submission_record.task_id
  join public.hunt_scenarios scenario_record
    on scenario_record.code = task_record.external_id
  join public.badges badge_record
    on badge_record.id = scenario_record.reward_badge_id
  where submission_record.id = p_submission_id
    and task_record.source_system = 'arena'
    and task_record.task_kind = 'hunt'
    and badge_record.state = 'active'
  order by scenario_record.scenario_version desc
  limit 1;

  if badge_row.id is null then
    return null;
  end if;

  -- Derived, not random — the same reasoning as `evaluate_badge_rules`. A
  -- re-decided submission must not award the badge a second time, and
  -- `badge_awards_source_unique` only makes that true if the key is stable.
  award_key := md5('scenario-badge:' || badge_row.id::text || ':' ||
                   p_learner_id::text)::uuid;

  insert into public.badge_awards (badge_id, learner_id, source_event_id)
  values (badge_row.id, p_learner_id, award_key)
  on conflict (badge_id, learner_id, source_event_id) do nothing;

  get diagnostics inserted = row_count;
  if inserted = 0 then
    return null;
  end if;

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  ) values (
    p_organization_id, p_learner_id, 'badge.awarded', 'notifications.badge_awarded',
    jsonb_build_object(
      'badge_id', badge_row.id,
      'badge_code', badge_row.code,
      'badge_label', coalesce(badge_row.labels ->> 'de', badge_row.code)
    ),
    -- Shares the `badge:<id>` namespace with the threshold badges on purpose.
    -- One toast per badge, ever, however it was earned — the Arena celebration
    -- overlay reads the unread state of this row.
    'badge:' || badge_row.id::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return badge_row.code;
end;
$scenario_badge$;

comment on function app_private.award_scenario_badge is
  'Awards hunt_scenarios.reward_badge_id when a hunt submission is accepted. '
  'Exactly once per learner and badge, via a derived source_event_id.';

alter function app_private.award_scenario_badge(uuid, uuid, uuid) owner to postgres;
revoke all on function app_private.award_scenario_badge(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;


-- Replaced whole, because that is what Postgres offers: the body is the one
-- from 20260725100000 with the scenario-badge call added beside the threshold
-- rules. Same signature, so no drop and no re-grant.
create or replace function app_private.award_for_event(
  p_learner_id uuid,
  p_organization_id uuid,
  p_source_kind text,
  p_source_event_id uuid,
  p_submission_id uuid default null,
  p_skill_id uuid default null,
  p_streak_length integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $award$
declare
  xp_before integer;
  xp_after integer;
  level_before integer;
  level_after integer;
  gained integer := 0;
  granted_badges text[];
  scenario_badge text;
  finding_row record;
  resolved_skill uuid := p_skill_id;
begin
  if p_learner_id is null or p_organization_id is null then
    return jsonb_build_object('awarded', 0, 'badges', '[]'::jsonb);
  end if;

  select coalesce(sum(entry.points), 0) into xp_before
  from public.xp_ledger entry where entry.learner_id = p_learner_id;

  if p_source_kind = 'accepted_submission' and p_submission_id is not null then
    -- The task's own skill, heaviest mapping first. Null when the task maps to
    -- none — the ledger column is nullable precisely so that is not fatal.
    if resolved_skill is null then
      select mapping.skill_id into resolved_skill
      from public.submissions submission_record
      join public.task_skill_mappings mapping on mapping.task_id = submission_record.task_id
      where submission_record.id = p_submission_id
      order by mapping.weight_basis_points desc, mapping.skill_id
      limit 1;
    end if;

    -- §8.1 "Praxis-Aufgabe genehmigt (Trainer)" — the acceptance itself.
    gained := gained + app_private.award_xp(
      p_learner_id, p_organization_id, p_source_event_id,
      'practice_approved', resolved_skill,
      'Abgabe von der Trainerin oder dem Trainer freigegeben'
    );

    -- Then every defect the trainer actually confirmed on this submission.
    --
    -- ⚠️ Read at THIS moment, from the verdicts already recorded. WS-10's
    -- ground-truth panel sits beside the decision control on the same review
    -- screen, so the trainer's natural order is: set the verdicts, then accept.
    -- A verdict changed AFTER acceptance pays nothing — see ISSUES.md I-051.
    for finding_row in
      select finding.id, finding.verdict, finding.reported_summary
      from public.hunt_findings finding
      where finding.submission_id = p_submission_id
        and finding.verdict in ('confirmed', 'bonus')
      order by finding.created_at
    loop
      gained := gained + app_private.award_xp(
        p_learner_id, p_organization_id, finding_row.id,
        case when finding_row.verdict = 'bonus' then 'defect_report_bonus' else 'defect_report' end,
        resolved_skill,
        left(coalesce(nullif(btrim(finding_row.reported_summary), ''), 'Fehlerbericht'), 180)
      );
    end loop;

  elsif p_source_kind in ('streak_milestone', 'daily_activity') then
    -- The rule code arrives as the source kind's companion; the caller derives
    -- a stable source event so a replay awards nothing twice.
    gained := gained + app_private.award_xp(
      p_learner_id, p_organization_id, p_source_event_id,
      case
        when p_source_kind = 'daily_activity' then 'daily_activity'
        else 'streak_' || coalesce(p_streak_length, 0)::text
      end,
      null,
      case
        when p_source_kind = 'daily_activity' then 'Heute gelernt'
        else coalesce(p_streak_length, 0)::text || ' Tage am Stück gelernt'
      end
    );
  end if;

  select coalesce(sum(entry.points), 0) into xp_after
  from public.xp_ledger entry where entry.learner_id = p_learner_id;

  granted_badges := app_private.evaluate_badge_rules(
    p_learner_id, p_organization_id, p_streak_length
  );

  -- A hunt scenario may name one badge of its own — the only badge in the
  -- product that is not a threshold. Evaluated here, beside the threshold
  -- rules, so "what did this acceptance earn" has one answer and one array.
  if p_source_kind = 'accepted_submission' then
    scenario_badge := app_private.award_scenario_badge(
      p_learner_id, p_organization_id, p_submission_id
    );
    if scenario_badge is not null then
      granted_badges := coalesce(granted_badges, array[]::text[]) || scenario_badge;
    end if;
  end if;

  level_before := app_private.xp_level(xp_before);
  level_after  := app_private.xp_level(xp_after);

  if level_after > level_before then
    insert into public.notifications (
      organization_id, recipient_id, event_type, template_key, payload, deduplication_key
    ) values (
      p_organization_id, p_learner_id, 'level.up', 'notifications.level_up',
      jsonb_build_object('level', level_after, 'total_xp', xp_after),
      -- One toast per level, ever, even if a later re-scoring were to move a
      -- learner across the same boundary twice.
      'level:' || p_learner_id::text || ':' || level_after::text
    ) on conflict (recipient_id, deduplication_key) do nothing;
  end if;

  return jsonb_build_object(
    'awarded', gained,
    'total_xp', xp_after,
    'level_before', level_before,
    'level_after', level_after,
    'badges', to_jsonb(granted_badges)
  );
end
$award$;

alter function app_private.award_for_event(uuid, uuid, text, uuid, uuid, uuid, integer)
  owner to postgres;

commit;

-- ─── Verification, by schema effect ────────────────────────────────────────
do $verify$
declare
  observed integer;
begin
  select count(*) into observed
  from pg_catalog.pg_attribute attribute_record
  where attribute_record.attrelid = 'public.hunt_scenarios'::regclass
    and attribute_record.attname = 'reward_badge_id'
    and not attribute_record.attisdropped;
  if observed <> 1 then
    raise exception 'hunt_scenarios.reward_badge_id was not added';
  end if;

  -- Exactly one upsert_hunt_scenario. Two would mean the drop above missed the
  -- old signature and every call from PostgREST would fail as ambiguous.
  select count(*) into observed
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname = 'upsert_hunt_scenario';
  if observed <> 1 then
    raise exception 'expected exactly one upsert_hunt_scenario, found %', observed;
  end if;
end;
$verify$;
