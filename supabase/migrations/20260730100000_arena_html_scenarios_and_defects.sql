-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1c, part 1 — admin-authored Arena: free-form HTML, and one home for
-- the planted-defect answer key.
--
-- FEATURE_BUILD_PLAN §1.7. Today a hunt scenario is a row whose `configuration`
-- drives a component-registry engine: `surfaces[]` name React components in
-- src/features/arena/sandbox/registry.ts, and `defects[]` name effects in
-- surface-effects.ts that the engine injects at run time. Adding a scenario is
-- data plus, sometimes, a new component — which is what that engine was built
-- for and is documented as its success criterion.
--
-- The product owner asked for something the registry cannot do: an ADMIN, not a
-- developer, writes the buggy screen, as free-form HTML with CSS and
-- JavaScript, in a modal. There is no component to register and no effect code
-- to name; the bug is written into the markup by hand.
--
--
-- ADDITIVE, NOT A REPLACEMENT
--
-- `html` is nullable and the two modes coexist:
--
--     html is null      → the registry engine renders configuration.surfaces
--                         (checkout-v1, and anything the engine already does
--                         better than hand-written markup)
--     html is not null  → the free-form document renders in a sandboxed iframe
--
-- Replacing the engine would throw away a working scenario, its generated seed,
-- its drift check (scripts/ws9-check-scenario.mjs) and its component library,
-- to gain nothing the new mode needs.
--
--
-- WHY THE DEFECT LIST BECOMES A TABLE — the decision §4 asked to record
--
-- The build plan left this open: "a new table, or a jsonb column with a shape
-- check — decide and record which". A table, for three reasons, none of them
-- tidiness:
--
--  1. THE TRAINER IS THE POINT. Decision §2.2 exists because the review screen
--     matches a learner's free-text report against known defects and shows
--     "2 von 5 gefunden"; that ranked match is the entire mitigation for a
--     trainer facing sixty reports per cohort. hunt_findings.planted_code is
--     the join key. With the answer key inside a jsonb blob, "does this code
--     exist for this scenario" is a document scan; as a table with
--     unique (scenario_id, code) it is an index lookup, and a typo'd code
--     becomes impossible rather than merely wrong.
--
--  2. TWO KINDS OF THING WERE SHARING ONE ARRAY. configuration.defects carries
--     `effect`, `trigger` and `params` — instructions to the rendering engine —
--     beside `expected` and `reproduction`, which are grading notes. An HTML
--     scenario has the second kind and none of the first. Keeping them together
--     would mean an HTML scenario storing an engine instruction it can never
--     use, and a jsonb shape check that has to be permissive enough to allow
--     that.
--
--  3. THE ADMIN EDITS THEM ONE AT A TIME. Add and remove rows in a modal, per
--     §1.7. Rows have ids; array elements have positions that shift under you.
--
-- configuration.defects is NOT removed and NOT deprecated. It stays as what it
-- always was — how the engine injects a bug — and this table becomes the single
-- source of what a trainer grades against, for BOTH modes. The registry
-- scenario's grading half is backfilled below so nothing has two answers.
--
--
-- THE ANSWER KEY DOES NOT GO TO THE LEARNER
--
-- hunt_scenarios_scoped_read lets a learner read an active scenario row,
-- because the engine needs `configuration` client-side to inject its effects.
-- That is unavoidable for the registry mode and always has been.
--
-- It is entirely avoidable for the HTML mode, where the bug is already in the
-- markup, and this table takes the stricter rule: NO learner-readable policy at
-- all. Trainers and content authors only. `expected` and `reproduction` are
-- worked answers — sending them to the client would turn every hunt into a
-- reading exercise (decision §2.2, and the rule hunt-panel.tsx already keeps).
--
--
-- SANITISING ON SAVE
--
-- Decision §2.1 is explicit that the sandbox — sandbox="allow-scripts" and
-- nothing else — is the control, and that sanitising is defence in depth, not
-- a substitute. What is stripped here is exactly what that note names:
-- <script src="…"> pointing off-document, and form actions aimed back at our
-- own origin. Inline <script> is deliberately NOT stripped: the requirement is
-- a genuinely interactive screen, and the opaque origin is what makes running
-- it safe.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The scenario card, and the HTML box ────────────────────────────────

alter table public.hunt_scenarios
  add column if not exists html text,
  -- §1.7: "an image or video for the start and the end".
  add column if not exists start_media_url text,
  add column if not exists end_media_url text;

comment on column public.hunt_scenarios.html is
  'Free-form HTML/CSS/JS authored by an admin, rendered in an iframe with '
  'sandbox="allow-scripts" and nothing else. Null means this scenario is '
  'rendered by the component-registry engine from configuration.surfaces.';

do $constraints$
begin
  -- Same protocol rule the course media columns took in 20260728100000: an
  -- absolute http(s) URL, or a single-leading-slash root-relative path.
  -- '//evil.example' is protocol-relative and would load a foreign origin.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.hunt_scenarios'::regclass
      and conname = 'hunt_scenarios_media_protocol'
  ) then
    alter table public.hunt_scenarios
      add constraint hunt_scenarios_media_protocol check (
        (start_media_url is null
         or start_media_url ~ '^https?://' or start_media_url ~ '^/[^/]')
        and (end_media_url is null
             or end_media_url ~ '^https?://' or end_media_url ~ '^/[^/]')
      );
  end if;

  -- A scenario must be renderable by exactly one of the two engines. A row with
  -- neither renders an empty frame the learner cannot report a bug in; a row
  -- with both leaves the route guessing which one the author meant.
  --
  -- Scoped to state='active' so a draft can be saved half-written — an admin
  -- typing HTML into a modal has an empty box for the first keystroke.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.hunt_scenarios'::regclass
      and conname = 'hunt_scenarios_one_render_mode'
  ) then
    alter table public.hunt_scenarios
      add constraint hunt_scenarios_one_render_mode check (
        state <> 'active'
        or (html is not null) <> (
          jsonb_typeof(configuration -> 'surfaces') = 'array'
          and jsonb_array_length(configuration -> 'surfaces') > 0
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.hunt_scenarios'::regclass
      and conname = 'hunt_scenarios_html_not_blank'
  ) then
    alter table public.hunt_scenarios
      add constraint hunt_scenarios_html_not_blank check (
        html is null or length(btrim(html)) > 0
      );
  end if;
end
$constraints$;

-- ─── 2. hunt_scenario_defects — the answer key ─────────────────────────────

create table if not exists public.hunt_scenario_defects (
  id uuid primary key default app_private.uuid7(),
  scenario_id uuid not null
    references public.hunt_scenarios (id) on delete cascade,
  -- The handle hunt_findings.planted_code carries. Stable across scenario
  -- versions on purpose: a trainer's past decision keeps meaning what it meant.
  code text not null,
  position integer not null default 0,
  -- Course material. German, like the scenario's title and description, and for
  -- the same reason: CONTENT_LOCALES === ["de"].
  title text not null,
  -- Where in the screen it is. Free text — for HTML scenarios there is no
  -- surface registry to name.
  location_hint text not null default '',
  -- What SHOULD happen. This is the worked answer; see the header.
  expected_behaviour text not null default '',
  reproduction text not null default '',
  severity text not null default 'medium',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint hunt_scenario_defects_code_unique unique (scenario_id, code),
  constraint hunt_scenario_defects_code_not_blank
    check (length(btrim(code)) > 0),
  constraint hunt_scenario_defects_title_not_blank
    check (length(btrim(title)) > 0),
  constraint hunt_scenario_defects_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint hunt_scenario_defects_position_sane
    check (position >= 0 and position < 1000)
);

comment on table public.hunt_scenario_defects is
  'The planted-defect answer key a trainer grades a hunt report against. '
  'Never readable by a learner and never sent into the sandbox iframe: '
  'expected_behaviour and reproduction are the worked answers.';

create index if not exists hunt_scenario_defects_scenario_idx
  on public.hunt_scenario_defects (scenario_id, position, code);

alter table public.hunt_scenario_defects enable row level security;

grant select on public.hunt_scenario_defects to authenticated;
revoke insert, update, delete on public.hunt_scenario_defects from authenticated;

-- Content authors, and trainers who hold review.manage. Deliberately NO branch
-- for the learner who owns the attempt — contrast hunt_findings_scoped_read,
-- which does have one, because a learner may read their OWN reports but never
-- the list they were graded against.
drop policy if exists hunt_scenario_defects_staff_read on public.hunt_scenario_defects;
create policy hunt_scenario_defects_staff_read
  on public.hunt_scenario_defects for select to authenticated
  using (
    exists (
      select 1 from public.hunt_scenarios scenario_record
      where scenario_record.id = hunt_scenario_defects.scenario_id
        and (
          (select app_private.has_permission(
            'content.manage', scenario_record.organization_id, null))
          or (select app_private.has_permission(
            'review.manage', scenario_record.organization_id, null))
        )
    )
  );

-- ─── 3. Backfill the grading half of the registry scenario ─────────────────
-- checkout-v1's configuration.defects already IS an answer key; it simply also
-- carries engine instructions. Copied across so the trainer panel has one place
-- to read from regardless of how a scenario renders. 'decoy' entries are
-- excluded: expected_findings counts planted defects only, and a decoy that
-- appeared in the answer key would be a defect a trainer could confirm.

insert into public.hunt_scenario_defects (
  scenario_id, code, position, title, location_hint,
  expected_behaviour, reproduction, severity
)
select
  scenario_record.id,
  defect_record.value ->> 'code',
  (defect_record.ordinality - 1)::integer,
  coalesce(
    nullif(btrim(defect_record.value ->> 'expected'), ''),
    defect_record.value ->> 'code'
  ),
  coalesce(defect_record.value ->> 'surface', ''),
  coalesce(defect_record.value ->> 'expected', ''),
  coalesce(defect_record.value ->> 'reproduction', ''),
  case
    when defect_record.value ->> 'severity'
      in ('low', 'medium', 'high', 'critical')
    then defect_record.value ->> 'severity'
    else 'medium'
  end
from public.hunt_scenarios scenario_record
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(scenario_record.configuration -> 'defects') = 'array'
      then scenario_record.configuration -> 'defects'
    else '[]'::jsonb
  end
) with ordinality as defect_record(value, ordinality)
where coalesce(defect_record.value ->> 'kind', 'planted') = 'planted'
  and nullif(btrim(defect_record.value ->> 'code'), '') is not null
on conflict (scenario_id, code) do nothing;

-- ─── 4. Sanitising, and the authoring commands ─────────────────────────────

create or replace function app_private.sanitize_scenario_html(p_html text)
returns text
language sql
immutable
set search_path = ''
as $function$
  -- ⚠️ TWO POSTGRES REGEX TRAPS, BOTH OF WHICH MADE THIS FUNCTION A NO-OP.
  --
  -- 1. WORD BOUNDARIES ARE \y, NOT \b. Postgres advanced regular expressions
  --    define \b as a BACKSPACE character. The first draft used \b out of
  --    Perl/JavaScript habit, so every pattern matched nothing and this
  --    function returned its input unchanged — a security control that looked
  --    present, ran on every save, and did absolutely nothing.
  --
  -- 2. GREEDINESS IS A PROPERTY OF THE WHOLE PATTERN, NOT OF ONE QUANTIFIER.
  --    In an ARE, the FIRST quantifier decides it for the entire expression.
  --    The second draft matched the whole element with
  --    '<script\s[^>]*\ysrc\s*=[^>]*>.*?</script\s*>' — but the leading
  --    '[^>]*' is greedy, so the '.*?' was treated as greedy too and the match
  --    ran from the first external <script> all the way to the LAST </script>,
  --    deleting the author's inline scripts in between. That would have broken
  --    every interactive scenario while appearing to work on a single-script
  --    test.
  --
  -- Both are avoided by never spanning the element at all. These patterns
  -- neutralise the src ATTRIBUTE inside the opening tag; '[^>]*' cannot cross a
  -- '>', so a match is confined to one tag and greediness cannot matter. A
  -- <script> with no src and an empty body is inert, and 'data-blocked' leaves
  -- a visible trace for whoever wonders where their script went.
  --
  -- Both were caught only because the verification block below asserts on the
  -- RESULT of sanitising a hostile string rather than on the function existing.
  select case
    when p_html is null then null
    else
      -- <script src="…"> — a remote script the author did not write and we
      -- cannot review. Covers double-quoted, single-quoted and bare values, so
      -- src='//evil.example/x.js' is caught too. Inline <script> stays; the
      -- requirement is a genuinely interactive screen and the opaque origin is
      -- what makes running it safe.
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          p_html,
          '(<script\y[^>]*\y)src\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)',
          '\1data-blocked ',
          'gi'
        ),
        -- A form action aimed at our own origin would post the student's
        -- session-bearing request back at the application. The iframe's opaque
        -- origin means it carries no cookies, so this is belt and braces.
        '(<form\y[^>]*\yaction\s*=\s*")(/[^"]*)"',
        '\1about:blank"',
        'gi'
      )
  end;
$function$;

comment on function app_private.sanitize_scenario_html is
  'Defence in depth for admin-authored scenario HTML. The sandbox attribute is '
  'the control (FEATURE_BUILD_PLAN 2.1); this only removes external <script '
  'src> and same-origin form actions.';

create or replace function public.upsert_hunt_scenario(
  p_code text,
  p_title text,
  p_description text,
  p_html text default null,
  p_expected_findings integer default null,
  p_start_media_url text default null,
  p_end_media_url text default null,
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
      html, start_media_url, end_media_url, expected_findings, state
    ) values (
      resolved_organization_id, p_code, 1, btrim(p_title),
      coalesce(p_description, ''),
      app_private.sanitize_scenario_html(p_html),
      p_start_media_url, p_end_media_url,
      coalesce(p_expected_findings, 0), p_state
    )
    returning * into scenario_row;
  else
    update public.hunt_scenarios scenario_record
    set title = btrim(p_title),
        description = coalesce(p_description, scenario_record.description),
        html = app_private.sanitize_scenario_html(p_html),
        start_media_url = p_start_media_url,
        end_media_url = p_end_media_url,
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
                       'render_mode',
                       case when scenario_row.html is null
                         then 'registry' else 'html' end)
  );

  return scenario_row;
end;
$function$;

-- The whole defect list is replaced in one call. Piecemeal add/remove would let
-- a half-saved modal leave the answer key disagreeing with the screen, and
-- expected_findings is derived from the list, so it has to move with it.
create or replace function public.set_hunt_scenario_defects(
  p_scenario_id uuid,
  p_defects jsonb,
  p_correlation_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  scenario_row public.hunt_scenarios;
  written_count integer;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_defects) is distinct from 'array' then
    raise exception 'set_hunt_scenario_defects: a JSON array is required'
      using errcode = '22023';
  end if;

  select scenario_record.* into scenario_row
  from public.hunt_scenarios scenario_record
  where scenario_record.id = p_scenario_id;
  if scenario_row.id is null then
    raise exception 'hunt scenario % not found', p_scenario_id using errcode = 'P0002';
  end if;
  if not (select app_private.has_permission(
    'content.manage', scenario_row.organization_id, null
  )) then
    raise exception 'set_hunt_scenario_defects: content administration denied'
      using errcode = '42501';
  end if;

  delete from public.hunt_scenario_defects defect_record
  where defect_record.scenario_id = p_scenario_id;

  insert into public.hunt_scenario_defects (
    scenario_id, code, position, title, location_hint,
    expected_behaviour, reproduction, severity
  )
  select
    p_scenario_id,
    btrim(defect_record.value ->> 'code'),
    (defect_record.ordinality - 1)::integer,
    btrim(defect_record.value ->> 'title'),
    coalesce(defect_record.value ->> 'location_hint', ''),
    coalesce(defect_record.value ->> 'expected_behaviour', ''),
    coalesce(defect_record.value ->> 'reproduction', ''),
    case
      when defect_record.value ->> 'severity'
        in ('low', 'medium', 'high', 'critical')
      then defect_record.value ->> 'severity'
      else 'medium'
    end
  from jsonb_array_elements(p_defects)
    with ordinality as defect_record(value, ordinality);

  get diagnostics written_count = row_count;

  -- Kept honest rather than trusted from the client: "2 von 5 gefunden" is read
  -- straight off this number.
  update public.hunt_scenarios scenario_record
  set expected_findings = written_count,
      updated_at = statement_timestamp()
  where scenario_record.id = p_scenario_id;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    scenario_row.organization_id, actor_id, 'admin', 'hunt_scenario.defects_set',
    'hunt_scenario', p_scenario_id, scenario_row.row_version, correlation_id,
    jsonb_build_object('defect_count', written_count)
  );

  return written_count;
end;
$function$;

-- Scenario writes join the RPC-only rule (I-003). Nothing in the application
-- writes hunt_scenarios today — QA_TEST_PLAN §9 records that they are seeded
-- through SQL — so this closes a direct write path before an admin screen
-- starts using it, rather than taking one away. The seed runs as the table
-- owner and is unaffected.
revoke insert, update, delete on public.hunt_scenarios from authenticated;

grant execute on function public.upsert_hunt_scenario(
  text, text, text, text, integer, text, text, public.record_state, uuid, uuid
) to authenticated;
grant execute on function public.set_hunt_scenario_defects(uuid, jsonb, uuid) to authenticated;

commit;

-- ─── Verification, by schema effect ────────────────────────────────────────
do $verify$
declare
  observed integer;
  sanitized text;
begin
  select count(*) into observed
  from pg_catalog.pg_attribute attribute_record
  where attribute_record.attrelid = 'public.hunt_scenarios'::regclass
    and attribute_record.attname in ('html', 'start_media_url', 'end_media_url')
    and not attribute_record.attisdropped;
  if observed <> 3 then
    raise exception 'expected 3 new hunt_scenarios columns, found %', observed
      using errcode = '55000';
  end if;

  -- The backfill is the point of this migration's grading half; an empty table
  -- would mean the trainer panel has nothing to match against.
  select count(*) into observed from public.hunt_scenario_defects;
  if observed < 1 then
    raise exception 'hunt_scenario_defects is empty; the backfill matched nothing'
      using errcode = '55000';
  end if;
  raise notice 'backfilled % planted defects', observed;

  -- Assert the answer key is NOT reachable by a learner: the only policy on the
  -- table must require content.manage or review.manage.
  select count(*) into observed
  from pg_catalog.pg_policy
  where polrelid = 'public.hunt_scenario_defects'::regclass;
  if observed <> 1 then
    raise exception
      'hunt_scenario_defects has % policies; exactly one staff-only read policy was intended',
      observed using errcode = '55000';
  end if;

  -- Sanitising, checked by effect rather than by "the function exists". The
  -- hostile sample deliberately puts an inline script BETWEEN two external
  -- ones: that ordering is what exposed the greediness bug described above, and
  -- a single-script sample would have passed with the broken pattern.
  sanitized := app_private.sanitize_scenario_html(
    '<script src="https://evil.example/x.js"></script>'
    || '<script>let ok = 1;</script>'
    || '<script src=''//also.bad/y.js'' defer></script>'
    || '<form action="/api/steal" method="post"></form>'
  );
  if sanitized like '%evil.example%' or sanitized like '%also.bad%' then
    raise exception 'sanitize_scenario_html left an external script src: %',
      sanitized using errcode = '55000';
  end if;
  if sanitized not like '%let ok = 1;%' then
    raise exception 'sanitize_scenario_html stripped an INLINE script; the '
      'sandbox needs those to work' using errcode = '55000';
  end if;
  if sanitized like '%action="/api/steal"%' then
    raise exception 'sanitize_scenario_html left a same-origin form action'
      using errcode = '55000';
  end if;

  raise notice 'Phase 1c part 1 verified';
end
$verify$;
