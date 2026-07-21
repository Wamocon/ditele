-- ---------------------------------------------------------------------------
-- WS-11 — the award engine.
--
-- `05_BUG_ARENA_AND_GAMIFICATION.md` §G5: one `security definer` RPC, called
-- from inside the existing review-decision transaction. Not a trigger, not a
-- background job. Same transaction means a learner can never see "accepted"
-- without the XP that goes with it.
--
-- Forward-only and idempotent. Safe to apply twice: every DDL statement is
-- guarded, every seed is an upsert, and the one patch to a shipped function
-- checks for its own marker before touching anything.
--
-- ── The three shipped-schema facts this file had to accommodate ────────────
--
-- None of them is in either design document; all three were measured.
--
--  1. `xp_ledger.skill_id` is `not null` with an FK to `public.skills`, and
--     this deployment holds exactly ONE skill. A streak bonus has no skill to
--     attribute. The column becomes nullable — checked against a live row count
--     first, and free at 0 rows.
--  2. `xp_ledger.source_kind` is a CHECK over four values, none of which covers
--     a streak or a daily-activity award. The CHECK is widened, never replaced.
--  3. Every reward table has FORCE ROW LEVEL SECURITY on and is owned by
--     `postgres`, which holds `rolbypassrls`. So a definer function owned by
--     `postgres` writes freely — and one owned by anything else would be
--     silently blocked by its own tables. That is why the ownership lines at
--     the bottom are load-bearing, not boilerplate.
--
-- ── Why the engine must not be able to raise ───────────────────────────────
--
-- Because it runs inside the trainer's accept, an exception here does not
-- degrade a reward — it makes the trainer unable to accept the submission at
-- all, on a shipped app. So the engine is written to be TOTAL: no branch
-- assumes a skill mapping exists, a scenario is seeded, a finding was decided,
-- or a rule is present. Missing data awards less, never fails.
--
-- Deliberately NOT wrapped in `exception when others then null` — swallowing
-- would break the very guarantee §G5 buys with the shared transaction, and
-- would hide a real bug behind a silently missing reward.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Widen `xp_ledger` so non-submission awards are expressible
-- ---------------------------------------------------------------------------

do $widen$
declare
  ledger_rows bigint;
begin
  -- Never a destructive alter without a data check first. `drop not null` only
  -- widens what is accepted, so no existing row can be invalidated — the count
  -- is recorded so a future reader can see the decision was made with the
  -- numbers in hand rather than assumed.
  select count(*) into ledger_rows from public.xp_ledger;
  raise notice 'xp_ledger holds % row(s) before the alter', ledger_rows;

  alter table public.xp_ledger alter column skill_id drop not null;
end
$widen$;

alter table public.xp_ledger drop constraint if exists xp_ledger_source_kind_check;
alter table public.xp_ledger
  add constraint xp_ledger_source_kind_check
  check (source_kind in (
    -- The four the table shipped with. Widened, never replaced: dropping one
    -- would invalidate rows a future migration might already have written.
    'accepted_submission',
    'validated_evidence',
    'mastery_gain',
    'completed_mission',
    -- WS-11.
    'hunt_finding',
    'streak_milestone',
    'daily_activity'
  ));

-- ---------------------------------------------------------------------------
-- 2. `xp_rules` — §8.1 of anforderung/01_RESEARCH_LERNPLATTFORM.md, verbatim
-- ---------------------------------------------------------------------------
--
-- The values live in a table rather than inside the function so that a future
-- re-scoring is a seed plus a `rule_version` bump, not a function rewrite — and
-- so `xp_ledger.rule_version` keeps describing the points it actually recorded.
-- `src/features/arena/rewards/model.ts` carries the same table for the client,
-- and `scripts/ws11-check-rules.mjs` asserts the two agree.

create table if not exists public.xp_rules (
  code text not null,
  rule_version integer not null default 1 check (rule_version > 0),
  points integer not null check (points > 0),
  source_kind text not null,
  -- true when something in the shipped app actually pays this rule today.
  -- Several §8.1 rows describe events this application does not emit yet.
  -- Seeding them at their specified value makes wiring one later a call site
  -- rather than a migration; marking them false keeps the Arena from promising
  -- a learner XP that can never arrive.
  is_awarded boolean not null default false,
  state public.record_state not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (code, rule_version)
);

alter table public.xp_rules enable row level security;

drop policy if exists xp_rules_member_read on public.xp_rules;
create policy xp_rules_member_read on public.xp_rules
  for select to authenticated
  using (true);

grant select on public.xp_rules to authenticated;

insert into public.xp_rules (code, rule_version, points, source_kind, is_awarded) values
  -- §8.1, in the order the requirement lists them.
  ('video_completed',           1,  10, 'accepted_submission', false),
  ('pdf_read',                  1,   5, 'accepted_submission', false),
  ('quiz_passed',               1,  25, 'accepted_submission', false),
  ('quiz_perfect',              1,  40, 'accepted_submission', false),
  ('practice_submitted',        1,  15, 'accepted_submission', false),
  ('practice_approved',         1,  50, 'accepted_submission', true),
  ('defect_report',             1,  20, 'hunt_finding',        true),
  ('milestone_reached',         1, 100, 'accepted_submission', false),
  ('module_completed',          1, 150, 'accepted_submission', false),
  ('course_completed',          1, 500, 'accepted_submission', false),
  ('daily_activity',            1,   5, 'daily_activity',      true),
  ('question_answered_helpful', 1,  10, 'accepted_submission', false),
  ('bug_report_submitted',      1,  15, 'accepted_submission', false),
  ('content_feedback',          1,   5, 'accepted_submission', false),
  -- Derived, not specified. §G2 requires an unplanted find to be worth MORE
  -- than a planted one; §8.1 gives no figure for it. 20 (defect report) + 15
  -- (bug report against our own build) is the derivation, recorded here so a
  -- future re-scoring can see it was derived rather than handed down.
  ('defect_report_bonus',       1,  35, 'hunt_finding',        true),
  -- §8.4 verbatim. Three days is a badge with no XP, so it has no rule.
  ('streak_7',                  1,  50, 'streak_milestone',    true),
  ('streak_14',                 1, 100, 'streak_milestone',    true),
  ('streak_30',                 1, 200, 'streak_milestone',    true),
  ('streak_100',                1, 500, 'streak_milestone',    true)
on conflict (code, rule_version) do update
set points     = excluded.points,
    source_kind = excluded.source_kind,
    is_awarded = excluded.is_awarded,
    updated_at = statement_timestamp();

-- ---------------------------------------------------------------------------
-- 3. The badge catalogue — §8.3
-- ---------------------------------------------------------------------------
--
-- Global (`organization_id is null`), so the unique index in play is
-- `badges_global_code_version_uidx (code, rule_version)`.
--
-- Labels are German only. `badges.labels` is a `{de,en,ru}` jsonb like
-- `skills`, but German is the source of truth and a missing locale key falls
-- back to German at read time — writing a blank en/ru would render an empty
-- badge name, which is strictly worse than a German one.
--
-- Rule vocabulary, all evaluated by `app_private.evaluate_badge_rules`:
--   {"kind":"confirmed_findings",   "threshold":N}
--   {"kind":"bonus_findings",       "threshold":N}
--   {"kind":"accepted_submissions", "threshold":N}
--   {"kind":"xp_total",             "threshold":N}
--   {"kind":"streak_length",        "threshold":N}   -- WS-11 unit 3
-- An unrecognised kind never matches, so an unknown rule fails closed.

insert into public.badges (organization_id, code, labels, descriptions, rule, rule_version, state) values
  (null, 'first-bug-found',
   '{"de": "Erster Fund"}'::jsonb,
   '{"de": "Dein erster Fehlerbericht wurde von einer Trainerin oder einem Trainer bestätigt."}'::jsonb,
   '{"kind": "confirmed_findings", "threshold": 1}'::jsonb, 1, 'active'),
  (null, 'bug-hunter-5',
   '{"de": "Fehlerjäger"}'::jsonb,
   '{"de": "Fünf bestätigte Fehlerberichte."}'::jsonb,
   '{"kind": "confirmed_findings", "threshold": 5}'::jsonb, 1, 'active'),
  (null, 'bug-hunter-10',
   '{"de": "Fehlerjäger in Gold"}'::jsonb,
   '{"de": "Zehn bestätigte Fehlerberichte."}'::jsonb,
   '{"kind": "confirmed_findings", "threshold": 10}'::jsonb, 1, 'active'),
  (null, 'unplanted-find',
   '{"de": "Unerwarteter Fund"}'::jsonb,
   '{"de": "Du hast einen echten Fehler gefunden, den wir gar nicht eingebaut hatten."}'::jsonb,
   '{"kind": "bonus_findings", "threshold": 1}'::jsonb, 1, 'active'),
  (null, 'first-approval',
   '{"de": "Erste Freigabe"}'::jsonb,
   '{"de": "Deine erste Abgabe wurde freigegeben."}'::jsonb,
   '{"kind": "accepted_submissions", "threshold": 1}'::jsonb, 1, 'active'),
  (null, 'approved-10',
   '{"de": "Zehn Freigaben"}'::jsonb,
   '{"de": "Zehn freigegebene Abgaben."}'::jsonb,
   '{"kind": "accepted_submissions", "threshold": 10}'::jsonb, 1, 'active'),
  (null, 'streak-3',
   '{"de": "Warmlaufen"}'::jsonb,
   '{"de": "Drei Tage am Stück gelernt."}'::jsonb,
   '{"kind": "streak_length", "threshold": 3}'::jsonb, 1, 'active'),
  (null, 'streak-7',
   '{"de": "Eine Woche dran"}'::jsonb,
   '{"de": "Sieben Tage am Stück gelernt."}'::jsonb,
   '{"kind": "streak_length", "threshold": 7}'::jsonb, 1, 'active'),
  (null, 'streak-14',
   '{"de": "Zwei Wochen Power"}'::jsonb,
   '{"de": "Vierzehn Tage am Stück gelernt."}'::jsonb,
   '{"kind": "streak_length", "threshold": 14}'::jsonb, 1, 'active'),
  (null, 'streak-30',
   '{"de": "Monats-Marathon"}'::jsonb,
   '{"de": "Dreißig Tage am Stück gelernt."}'::jsonb,
   '{"kind": "streak_length", "threshold": 30}'::jsonb, 1, 'active'),
  (null, 'streak-100',
   '{"de": "Centurion"}'::jsonb,
   '{"de": "Hundert Tage am Stück gelernt."}'::jsonb,
   '{"kind": "streak_length", "threshold": 100}'::jsonb, 1, 'active')
on conflict (code, rule_version) where organization_id is null do update
set labels       = excluded.labels,
    descriptions = excluded.descriptions,
    -- WS-8's slice seeded `first-bug-found` with
    -- `{"kind":"placeholder","note":"WS-11 owns real rules"}`. This is where
    -- that placeholder becomes a real rule, exactly as its note anticipated.
    rule         = excluded.rule,
    state        = excluded.state,
    updated_at   = statement_timestamp();

-- ---------------------------------------------------------------------------
-- 4. `app_private.award_xp` — one ledger row, replay-safe
-- ---------------------------------------------------------------------------

create or replace function app_private.award_xp(
  p_learner_id uuid,
  p_organization_id uuid,
  p_source_event_id uuid,
  p_rule_code text,
  p_skill_id uuid,
  p_rationale text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $award_xp$
declare
  rule_row public.xp_rules;
  inserted_points integer := 0;
begin
  if p_learner_id is null or p_organization_id is null or p_source_event_id is null then
    return 0;
  end if;

  select rule_record.* into rule_row
  from public.xp_rules rule_record
  where rule_record.code = p_rule_code
    and rule_record.state = 'active'
  order by rule_record.rule_version desc
  limit 1;

  -- An unknown or retired rule awards nothing rather than raising. This runs
  -- inside a trainer's accept; a typo in a rule code must not cost them the
  -- ability to review.
  if rule_row.code is null then
    return 0;
  end if;

  -- `xp_ledger_source_unique (learner_id, source_event_id)` is the idempotency
  -- the schema shipped with, and it is used rather than worked around: a
  -- double-click, a retried request or a replayed decision inserts nothing the
  -- second time. Every caller therefore passes a source event that is stable
  -- for the thing being rewarded — a review id, a finding id, or a derived
  -- uuid for a streak milestone.
  insert into public.xp_ledger (
    organization_id, learner_id, skill_id, source_event_id,
    source_kind, points, rule_version, rationale
  ) values (
    p_organization_id, p_learner_id, p_skill_id, p_source_event_id,
    rule_row.source_kind, rule_row.points, rule_row.rule_version,
    -- `<rule_code>: <prose>` — the UI reads the code back out so it can show a
    -- translated rule name instead of the German sentence stored here.
    p_rule_code || ': ' || coalesce(nullif(btrim(p_rationale), ''), p_rule_code)
  )
  on conflict (learner_id, source_event_id) do nothing;

  get diagnostics inserted_points = row_count;
  return case when inserted_points > 0 then rule_row.points else 0 end;
end
$award_xp$;

-- ---------------------------------------------------------------------------
-- 5. `app_private.evaluate_badge_rules` — thresholds against current totals
-- ---------------------------------------------------------------------------

create or replace function app_private.evaluate_badge_rules(
  p_learner_id uuid,
  p_organization_id uuid,
  p_streak_length integer default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $badges$
declare
  badge_row record;
  threshold integer;
  observed integer;
  award_key uuid;
  inserted integer;
  granted text[] := array[]::text[];

  confirmed_findings integer;
  bonus_findings integer;
  accepted_submissions integer;
  xp_total integer;
begin
  if p_learner_id is null or p_organization_id is null then
    return granted;
  end if;

  -- Counted once, up front. Every badge rule reads these rather than issuing
  -- its own query, so adding a badge costs a row and not a table scan.
  select
    count(*) filter (where finding.verdict in ('confirmed', 'bonus')),
    count(*) filter (where finding.verdict = 'bonus')
  into confirmed_findings, bonus_findings
  from public.hunt_findings finding
  join public.attempts attempt_record on attempt_record.id = finding.attempt_id
  where attempt_record.learner_id = p_learner_id;

  select count(*) into accepted_submissions
  from public.submissions submission_record
  where submission_record.learner_id = p_learner_id
    and submission_record.state = 'accepted';

  select coalesce(sum(entry.points), 0) into xp_total
  from public.xp_ledger entry
  where entry.learner_id = p_learner_id;

  for badge_row in
    select badge.id, badge.code, badge.rule, badge.labels
    from public.badges badge
    where badge.state = 'active'
      and (badge.organization_id is null or badge.organization_id = p_organization_id)
    order by badge.code
  loop
    threshold := nullif(badge_row.rule ->> 'threshold', '')::integer;
    if threshold is null then
      continue;
    end if;

    -- An unrecognised rule kind leaves `observed` null and therefore never
    -- matches. Failing closed matters here: a badge is a claim about what a
    -- learner did, and awarding one on a rule we cannot evaluate is a lie.
    observed := case badge_row.rule ->> 'kind'
      when 'confirmed_findings'   then confirmed_findings
      when 'bonus_findings'       then bonus_findings
      when 'accepted_submissions' then accepted_submissions
      when 'xp_total'             then xp_total
      when 'streak_length'        then p_streak_length
      else null
    end;

    if observed is null or observed < threshold then
      continue;
    end if;

    -- ⚠️ A DERIVED, not a random, source event.
    --
    -- `badge_awards_source_unique (badge_id, learner_id, source_event_id)` only
    -- prevents a duplicate when the source event repeats. A threshold badge is
    -- re-evaluated on every accepted review, so a fresh uuid per evaluation
    -- would award "Erster Fund" again on every subsequent acceptance. Deriving
    -- the key from the pair turns that unique index into exactly-once, which is
    -- what a threshold badge means.
    award_key := md5('badge:' || badge_row.id::text || ':' || p_learner_id::text)::uuid;

    insert into public.badge_awards (badge_id, learner_id, source_event_id)
    values (badge_row.id, p_learner_id, award_key)
    on conflict (badge_id, learner_id, source_event_id) do nothing;

    get diagnostics inserted = row_count;
    if inserted > 0 then
      granted := granted || badge_row.code;

      insert into public.notifications (
        organization_id, recipient_id, event_type, template_key, payload, deduplication_key
      ) values (
        p_organization_id, p_learner_id, 'badge.awarded', 'notifications.badge_awarded',
        jsonb_build_object(
          'badge_id', badge_row.id,
          'badge_code', badge_row.code,
          'badge_label', coalesce(badge_row.labels ->> 'de', badge_row.code)
        ),
        -- One toast per badge, ever. The Arena's celebration overlay reads the
        -- unread state of this row, so a second notification would replay the
        -- celebration after the learner had already dismissed it.
        'badge:' || badge_row.id::text
      ) on conflict (recipient_id, deduplication_key) do nothing;
    end if;
  end loop;

  return granted;
end
$badges$;

-- ---------------------------------------------------------------------------
-- 6. `app_private.xp_level` — §8.2, and the twin of `levelForXp` in TypeScript
-- ---------------------------------------------------------------------------

create or replace function app_private.xp_level(p_total_xp integer)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $level$
  select case
    when coalesce(p_total_xp, 0) >= 10000 then 12
    when p_total_xp >= 7500 then 11
    when p_total_xp >= 5500 then 10
    when p_total_xp >= 4000 then 9
    when p_total_xp >= 3000 then 8
    when p_total_xp >= 2200 then 7
    when p_total_xp >= 1500 then 6
    when p_total_xp >= 1000 then 5
    when p_total_xp >=  600 then 4
    when p_total_xp >=  300 then 3
    when p_total_xp >=  100 then 2
    else 1
  end;
$level$;

-- ---------------------------------------------------------------------------
-- 7. `app_private.award_for_event` — the entry point, §G5
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 8. Ownership and grants
-- ---------------------------------------------------------------------------
--
-- `postgres` holds `rolbypassrls`; every reward table has FORCE ROW LEVEL
-- SECURITY on. These lines are what let the engine write at all — a definer
-- function owned by any other role would be blocked by the very tables it
-- exists to fill. `decide_submission_effects_unowned` is owned the same way for
-- the same reason.

alter function app_private.award_xp(uuid, uuid, uuid, text, uuid, text) owner to postgres;
alter function app_private.evaluate_badge_rules(uuid, uuid, integer) owner to postgres;
alter function app_private.award_for_event(uuid, uuid, text, uuid, uuid, uuid, integer) owner to postgres;
alter function app_private.xp_level(integer) owner to postgres;

-- Nothing in `app_private` is callable from a session. The engine is reachable
-- only from inside a definer function that has already authorised the actor —
-- which is the whole point of §G5's "called from inside the review-decision
-- transaction". A client-callable award RPC would be a way around the
-- XP-on-acceptance guard rail.
revoke all on function app_private.award_xp(uuid, uuid, uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.evaluate_badge_rules(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function app_private.award_for_event(uuid, uuid, text, uuid, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.xp_level(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Wire the engine into the review-decision transaction
-- ---------------------------------------------------------------------------
--
-- §G5 is explicit: called from INSIDE the existing transaction, not a trigger
-- and not a job. So the deployed body of
-- `app_private.decide_submission_effects_unowned` is patched in place, using
-- the same read-prosrc / replace / recreate idiom that
-- `20260717100050_content_integrity_and_trainer_scope.sql` uses on this exact
-- function — rather than re-typing 12k characters of shipped review logic and
-- hoping the copy is faithful.
--
-- WS-10 recorded the trap this guards against: a `.replace()` that "worked" may
-- have matched only part of what you intended, and a guard of "the string
-- changed" is satisfied by a partial match. So the occurrence count is asserted
-- to be exactly one, before and after.

do $wire$
declare
  function_body text;
  anchor constant text := 'on conflict (recipient_id, deduplication_key) do nothing;';
  award_block constant text :=
    'on conflict (recipient_id, deduplication_key) do nothing;' || E'\n\n' ||
    '  -- WS-11 (20260725100000): the award engine, in this transaction by' || E'\n' ||
    '  -- design (05_ G5). XP is paid on TRAINER ACCEPTANCE and never on' || E'\n' ||
    '  -- submission alone -- otherwise the optimal strategy is spamming' || E'\n' ||
    '  -- low-effort reports, and the game teaches the opposite of the course.' || E'\n' ||
    '  if p_decision = ''accepted'' then' || E'\n' ||
    '    perform app_private.award_for_event(' || E'\n' ||
    '      submission_row.learner_id,' || E'\n' ||
    '      submission_row.organization_id,' || E'\n' ||
    '      ''accepted_submission'',' || E'\n' ||
    '      review_id,' || E'\n' ||
    '      submission_row.id' || E'\n' ||
    '    );' || E'\n' ||
    '  end if;';
  occurrences integer;
begin
  select p.prosrc into function_body
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.proname = 'decide_submission_effects_unowned';

  if function_body is null then
    raise exception 'app_private.decide_submission_effects_unowned not found — refusing to guess its body';
  end if;

  -- Idempotent: a second application finds its own marker and stops. Without
  -- this the award block would be appended twice, which would still be harmless
  -- (the ledger's unique index absorbs it) but would leave a body nobody can
  -- read.
  if position('award_for_event' in function_body) > 0 then
    raise notice 'decide_submission_effects_unowned already calls award_for_event — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 anchor in decide_submission_effects_unowned, found % — the shipped body has changed and this patch must be re-read before it is applied',
      occurrences;
  end if;

  function_body := replace(function_body, anchor, award_block);

  if position('award_for_event' in function_body) = 0 then
    raise exception 'patch did not apply — refusing to recreate the function unchanged';
  end if;

  execute format($function$
    create or replace function app_private.decide_submission_effects_unowned(
      p_submission_id uuid,
      p_submission_version_id uuid,
      p_expected_version bigint,
      p_decision public.review_decision,
      p_comment text,
      p_criterion_scores jsonb,
      p_idempotency_key text,
      p_correlation_id uuid
    )
    returns public.submissions
    language plpgsql
    security definer
    set search_path = ''
    as %L
  $function$, function_body);
end
$wire$;

-- Re-asserted verbatim from `20260717100050`. `create or replace` preserves
-- ownership and grants, but restating them means a future reader can see the
-- privilege posture of the patched function without going back three files.
alter function app_private.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) owner to postgres;
revoke all on function app_private.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Verify by effect, not by the migration ledger
-- ---------------------------------------------------------------------------
--
-- I-036: `supabase_migrations.schema_migrations` on this deployment is not
-- trustworthy — versions are recorded that have no file, and files are applied
-- that were never recorded. So this migration proves its own work.

do $verify$
declare
  problems text[] := array[]::text[];
begin
  if (select count(*) from public.xp_rules where state = 'active') < 19 then
    problems := problems || 'xp_rules is missing seeded rows';
  end if;
  if (select count(*) from public.badges where state = 'active' and organization_id is null) < 11 then
    problems := problems || 'badge catalogue is incomplete';
  end if;
  if exists (
    select 1 from public.badges
    where organization_id is null and rule ->> 'kind' = 'placeholder'
  ) then
    problems := problems || 'a placeholder badge rule survived';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = 'award_for_event'
  ) then
    problems := problems || 'award_for_event was not created';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'decide_submission_effects_unowned'
      and position('award_for_event' in p.prosrc) > 0
  ) then
    problems := problems || 'the review decision does not call the award engine';
  end if;
  if (select attnotnull from pg_catalog.pg_attribute
      where attrelid = 'public.xp_ledger'::regclass and attname = 'skill_id') then
    problems := problems || 'xp_ledger.skill_id is still NOT NULL';
  end if;
  -- RLS actually ON, not merely a table that exists. The Wave-A gate calls this
  -- out as the box people tick without checking.
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.xp_rules'::regclass) then
    problems := problems || 'xp_rules does not have RLS enabled';
  end if;

  if array_length(problems, 1) > 0 then
    raise exception 'WS-11 award engine verification failed: %', array_to_string(problems, '; ');
  end if;
  raise notice 'WS-11 award engine verified';
end
$verify$;

commit;
