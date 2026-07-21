-- ═══════════════════════════════════════════════════════════════════════════
-- Bug Arena — hunt_scenarios (ground truth) and hunt_findings (one row per
-- reported defect). 05_BUG_ARENA_AND_GAMIFICATION.md §G2.
--
-- hunt_scenarios is the planted-bug registry. It is what makes decision D2 --
-- trainer-assisted grading with ground truth -- possible at all, and D2 is the
-- primary mitigation for the trainer-load risk in §6. WS-9 reads
-- `configuration` to decide which defects a sandbox renders; WS-10 reads it to
-- rank a student's report against the planted list.
--
-- ⚠️ `title` and `description` are COURSE MATERIAL: German only
-- (CONTENT_LOCALES === ["de"], commit 8a507cb). They are plain text columns,
-- not a three-locale jsonb, because the studio has no editor for one and a
-- learner is meant to read German. NOTE the contrast with I-041: the *snapshot*
-- validator demands three locales for task/stage localizations. These columns
-- are not in the snapshot, so that rule does not reach them.
--
-- Idempotent: create table if not exists, drop policy if exists before create.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── hunt_scenarios ─────────────────────────────────────────────────────────
create table if not exists public.hunt_scenarios (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations (id) on delete restrict,
  -- `code` is the handle a task points at via tasks.external_id
  -- (with tasks.source_system = 'arena').
  code text not null,
  scenario_version integer not null default 1,
  -- Course material. German. See the header.
  title text not null,
  description text not null default '',
  -- The planted-bug list. WS-9 owns its shape and documents it in
  -- src/features/arena/sandbox/README.md; the database deliberately does not
  -- constrain it beyond "object", so adding a scenario stays data-only and
  -- never needs a migration.
  configuration jsonb not null default '{}'::jsonb,
  -- How many planted defects must be found for the hunt to count as passed.
  expected_findings integer not null default 1,
  state public.record_state not null default 'draft',
  row_version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint hunt_scenarios_code_version_unique unique (code, scenario_version),
  constraint hunt_scenarios_code_not_blank check (length(btrim(code)) > 0),
  constraint hunt_scenarios_title_not_blank check (length(btrim(title)) > 0),
  constraint hunt_scenarios_version_positive check (scenario_version > 0),
  constraint hunt_scenarios_expected_findings_sane
    check (expected_findings >= 0 and expected_findings <= 100),
  constraint hunt_scenarios_configuration_is_object
    check (jsonb_typeof(configuration) = 'object'),
  constraint hunt_scenarios_row_version_check check (row_version > 0)
);

create index if not exists hunt_scenarios_code_idx
  on public.hunt_scenarios (code, scenario_version);
create index if not exists hunt_scenarios_state_idx
  on public.hunt_scenarios (state) where state = 'active';

comment on table public.hunt_scenarios is
  'Bug Arena ground truth: one row per hunt scenario version, holding the '
  'planted-defect list. title/description are COURSE MATERIAL and German-only.';

-- ─── hunt_findings ──────────────────────────────────────────────────────────
-- One row per defect a student reports. `planted_code` is the trainer-confirmed
-- match into hunt_scenarios.configuration; null means it matched nothing planted.
--
-- 'bonus' is deliberate and is the point of the vocabulary: a student who finds
-- a real bug we did not plant should score MORE, not be marked wrong.
create table if not exists public.hunt_findings (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations (id) on delete restrict,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  submission_id uuid references public.submissions (id) on delete set null,
  scenario_id uuid references public.hunt_scenarios (id) on delete set null,
  -- The defect the student claims, as they described it.
  reported_summary text not null default '',
  -- The planted defect a trainer confirmed this matches. Null = unplanted.
  planted_code text,
  verdict text not null default 'pending',
  severity text,
  -- Why the trainer landed on this verdict. Shown to the student.
  -- public.profiles is keyed by user_id, not id.
  decided_by uuid references public.profiles (user_id) on delete set null,
  decided_at timestamptz,
  row_version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint hunt_findings_verdict_check
    check (verdict in ('pending', 'confirmed', 'duplicate', 'invalid', 'bonus')),
  constraint hunt_findings_severity_check
    check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  -- A confirmed finding must say WHAT it confirmed; a bonus must not, because
  -- a bonus is by definition not in the planted list.
  constraint hunt_findings_confirmed_needs_code
    check (verdict <> 'confirmed' or planted_code is not null),
  constraint hunt_findings_bonus_has_no_code
    check (verdict <> 'bonus' or planted_code is null),
  constraint hunt_findings_decided_pair
    check ((decided_at is null) = (decided_by is null)),
  constraint hunt_findings_row_version_check check (row_version > 0)
);

create index if not exists hunt_findings_attempt_idx
  on public.hunt_findings (attempt_id);
create index if not exists hunt_findings_submission_idx
  on public.hunt_findings (submission_id) where submission_id is not null;
create index if not exists hunt_findings_scenario_idx
  on public.hunt_findings (scenario_id) where scenario_id is not null;
create index if not exists hunt_findings_pending_idx
  on public.hunt_findings (verdict) where verdict = 'pending';

comment on table public.hunt_findings is
  'One row per defect reported in a hunt. verdict ''bonus'' means a real bug '
  'we did not plant -- worth more than a planted find, never less.';

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- 06_ARENA_WORKSTREAMS §6 asks the coordinator to check RLS is actually ON,
-- not merely that the tables exist. It is enabled here and asserted at the end.
alter table public.hunt_scenarios enable row level security;
alter table public.hunt_findings enable row level security;

-- Scenario reads: a learner may read an ACTIVE scenario that is referenced by a
-- task in a cohort they can access. app_private.can_access_cohort is the
-- existing security-definer helper every other scoped-read policy uses, so this
-- inherits the one authorization model rather than inventing a second.
drop policy if exists hunt_scenarios_scoped_read on public.hunt_scenarios;
create policy hunt_scenarios_scoped_read on public.hunt_scenarios
  for select to authenticated
  using (
    state = 'active'
    and exists (
      select 1
      from public.tasks task_record
      join public.cohorts cohort_record
        on cohort_record.content_version_id = task_record.content_version_id
      where task_record.source_system = 'arena'
        and task_record.external_id = hunt_scenarios.code
        and task_record.task_kind = 'hunt'
        and (select app_private.can_access_cohort(cohort_record.id))
    )
  );

-- Authors write. 'content.manage' is the same permission that gates every other
-- authoring table, so scenario authoring lands in the same role as task
-- authoring instead of needing a new one.
drop policy if exists hunt_scenarios_content_write on public.hunt_scenarios;
create policy hunt_scenarios_content_write on public.hunt_scenarios
  for all to authenticated
  using ((select app_private.has_permission('content.manage', organization_id)))
  with check ((select app_private.has_permission('content.manage', organization_id)));

-- Findings: the learner who owns the attempt reads their own; a trainer reads
-- the ones attached to a submission they are already allowed to review.
drop policy if exists hunt_findings_scoped_read on public.hunt_findings;
create policy hunt_findings_scoped_read on public.hunt_findings
  for select to authenticated
  using (
    exists (
      select 1 from public.attempts attempt_record
      where attempt_record.id = hunt_findings.attempt_id
        and attempt_record.learner_id = (select auth.uid())
    )
    or (
      hunt_findings.submission_id is not null
      and (select app_private.can_access_submission(hunt_findings.submission_id))
    )
  );

-- No INSERT/UPDATE policy on hunt_findings, and that is deliberate. Every
-- domain write in this codebase goes through a SECURITY DEFINER command RPC
-- (ISSUES.md I-003); WS-10 writes findings from inside the submit and review
-- transactions. Leaving direct DML unpoliced would be a second write path into
-- grading data.
revoke insert, update, delete on public.hunt_findings from authenticated;

grant select on public.hunt_scenarios to authenticated;
grant insert, update, delete on public.hunt_scenarios to authenticated;
grant select on public.hunt_findings to authenticated;

commit;

-- ─── Assert RLS really is on, per 06_… §6 ───────────────────────────────────
do $verify$
declare
  unprotected text;
begin
  select string_agg(class_record.relname, ', ') into unprotected
  from pg_catalog.pg_class class_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = class_record.relnamespace
  where namespace_record.nspname = 'public'
    and class_record.relname in ('hunt_scenarios', 'hunt_findings')
    and class_record.relrowsecurity is not true;

  if unprotected is not null then
    raise exception 'RLS is NOT enabled on: %', unprotected
      using errcode = '55000';
  end if;
  raise notice 'RLS verified on hunt_scenarios and hunt_findings';
end
$verify$;
