-- ═══════════════════════════════════════════════════════════════════════════
-- Bug Arena — per-learner relative scheduling (§G9) and lock-reason
-- enrichment (§G8). Both land here because both change the same function.
--
-- ⚠️ THIS IS THE HIGHEST-RISK MIGRATION IN WS-8.
-- app_private.learner_snapshot_task_lock_reasons is SECURITY DEFINER and feeds
-- RLS. The rule is: widen the return, never the permission.
--
-- Why enriching the return is safe, checked rather than assumed: all NINE call
-- sites compare the whole result to '[]'::jsonb (`= '[]'` or `<> '[]'`) and not
-- one of them inspects the contents of a reason object. Adding FIELDS to a
-- reason therefore cannot change any gating decision. Emitting a reason where
-- none was emitted before could, which is why part 1 below is written to leave
-- absolute schedules bit-for-bit identical.
--   20260717100000: 1135, 1229, 1296, 1403, 1555
--   20260717100050: 1075
--   20260717100100: 1051, 1326, 2044, 2498
--
-- ⚠️ The reason code is `required_task`. Both design docs call it
-- "prerequisite"; no such code has ever existed (ISSUES.md I-037).
--
-- Patched in place rather than re-declared: the function is ~300 lines of
-- validated authorization logic and re-typing it to change two blocks is how a
-- privilege bug gets introduced. Same idiom as 20260717100050.
--
-- Idempotent: each part detects its own post-state and returns early.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. task_schedules gains a relative mode ────────────────────────────────
alter table public.task_schedules
  add column if not exists offset_days integer,
  add column if not exists window_days integer;

comment on column public.task_schedules.offset_days is
  'Relative mode: days after the learner''s enrollments.decided_at that this '
  'task opens. Mutually exclusive with available_from.';
comment on column public.task_schedules.window_days is
  'Relative mode: how many days the task stays open after it opens. '
  'Null means it never closes.';

do $migration$
declare
  ambiguous_rows integer;
begin
  -- Never add a constraint to a live table without first proving the data
  -- satisfies it. A row with neither mode set would fail the ALTER halfway.
  select count(*) into ambiguous_rows
  from public.task_schedules schedule_record
  where schedule_record.available_from is null
    and schedule_record.offset_days is null;

  if ambiguous_rows > 0 then
    raise exception
      'task_schedules has % row(s) with neither available_from nor offset_days; '
      'the exactly-one-mode constraint cannot be applied until they are fixed',
      ambiguous_rows
      using errcode = '55000';
  end if;
end
$migration$;

alter table public.task_schedules
  drop constraint if exists task_schedules_mode;
alter table public.task_schedules
  add constraint task_schedules_mode check (
    (available_from is not null and offset_days is null and window_days is null)
    or (offset_days is not null and available_from is null and due_at is null)
  );

alter table public.task_schedules
  drop constraint if exists task_schedules_offset_sane;
alter table public.task_schedules
  add constraint task_schedules_offset_sane check (
    (offset_days is null or (offset_days >= 0 and offset_days <= 3650))
    and (window_days is null or (window_days > 0 and window_days <= 3650))
  );

-- ─── 2. Resolve both modes inside the lock-reason function ──────────────────
do $migration$
declare
  function_body text;
  occurrences integer;

  -- The absolute-only window test, exactly as deployed.
  old_window constant text :=
$old$        and (
          schedule_record.available_from is null
          or schedule_record.available_from <= statement_timestamp()
        )
        and (
          schedule_record.due_at is null
          or schedule_record.due_at >= statement_timestamp()
        )$old$;

  -- Absolute rows take the `else` branch and behave EXACTLY as before -- that
  -- is the whole point, since this function gates every existing cohort.
  -- Relative rows resolve against the learner's own enrollments.decided_at,
  -- which is the anchor 05_… §G9 specifies and is NOT NULL for every
  -- non-'requested' enrollment state.
  --
  -- Pause behaviour is ABSOLUTE-FROM-JOIN, per the coordinator decision
  -- recorded in ISSUES.md I-038: the calendar keeps running during inactivity
  -- and does not stretch to match active days. Stretching stays an additive
  -- change later, because nothing here reads activity.
  new_window constant text :=
$new$        and (
          case when schedule_record.offset_days is null then
            schedule_record.available_from is null
            or schedule_record.available_from <= statement_timestamp()
          else
            anchor_decided_at is not null
            and anchor_decided_at
              + make_interval(days => schedule_record.offset_days)
              <= statement_timestamp()
          end
        )
        and (
          case when schedule_record.offset_days is null then
            schedule_record.due_at is null
            or schedule_record.due_at >= statement_timestamp()
          else
            schedule_record.window_days is null
            or (
              anchor_decided_at is not null
              and anchor_decided_at + make_interval(
                days => schedule_record.offset_days + schedule_record.window_days
              ) >= statement_timestamp()
            )
          end
        )$new$;

  -- The un-enriched prerequisite reason, exactly as deployed.
  old_reason constant text :=
$old$        reasons := reasons || jsonb_build_array(
          jsonb_build_object('code', 'required_task')
        );$old$;

  -- Enriched so the UI can turn a lock chip into "play the hunt that unlocks
  -- this" (§G8). Every added field is read from p_snapshot -- the learner's OWN
  -- published projection, which they are already allowed to read -- so this
  -- cannot leak the existence of content they may not see. Reading the title
  -- from public.tasks instead would have been the leak.
  new_reason constant text :=
$new$        reasons := reasons || jsonb_build_array(
          jsonb_build_object(
            'code', 'required_task',
            'required_task_id', required_task_id,
            'required_task_kind',
              app_private.snapshot_task_payload(
                p_snapshot, required_task_id
              ) ->> 'task_kind',
            'required_task_title', (
              select localization_record.value ->> 'title'
              from jsonb_array_elements(
                coalesce(
                  app_private.snapshot_task_payload(
                    p_snapshot, required_task_id
                  ) -> 'localizations',
                  '[]'::jsonb
                )
              ) localization_record
              where localization_record.value ->> 'locale' = 'de'
              limit 1
            )
          )
        );$new$;
begin
  select procedure_record.prosrc into function_body
  from pg_catalog.pg_proc procedure_record
  where procedure_record.oid = (
    'app_private.learner_snapshot_task_lock_reasons(uuid,uuid,uuid,text,uuid,jsonb,jsonb)'
  )::regprocedure;

  if function_body is null then
    raise exception 'learner_snapshot_task_lock_reasons is missing'
      using errcode = '55000';
  end if;

  -- Already applied.
  if position('anchor_decided_at' in function_body) > 0 then
    raise notice 'lock-reason enrichment already applied; nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(
    replace(function_body, old_window, '')
  )) / length(old_window);
  if occurrences <> 1 then
    raise exception
      'lock-reason schedule window does not match the frozen contract '
      '(found % occurrences, expected 1)', occurrences
      using errcode = '55000';
  end if;

  occurrences := (length(function_body) - length(
    replace(function_body, old_reason, '')
  )) / length(old_reason);
  if occurrences <> 1 then
    raise exception
      'lock-reason required_task block does not match the frozen contract '
      '(found % occurrences, expected 1)', occurrences
      using errcode = '55000';
  end if;

  function_body := replace(function_body, old_window, new_window);
  function_body := replace(function_body, old_reason, new_reason);

  -- Declare the anchor and load it once, right after the existing declarations.
  function_body := replace(
    function_body,
    '  reasons jsonb := ''[]''::jsonb;',
    '  reasons jsonb := ''[]''::jsonb;' || chr(10)
    || '  anchor_decided_at timestamptz;'
  );
  function_body := replace(
    function_body,
    '  selected_task_id := (p_task_payload ->> ''id'')::uuid;',
    '  selected_task_id := (p_task_payload ->> ''id'')::uuid;' || chr(10)
    || '  select enrollment_record.decided_at into anchor_decided_at' || chr(10)
    || '  from public.enrollments enrollment_record' || chr(10)
    || '  where enrollment_record.id = p_enrollment_id;'
  );

  -- create or replace preserves owner and grants, so the authorization surface
  -- of this SECURITY DEFINER function is untouched.
  execute format($function$
    create or replace function app_private.learner_snapshot_task_lock_reasons(
      p_enrollment_id uuid,
      p_organization_id uuid,
      p_cohort_id uuid,
      p_progression_mode text,
      p_content_version_id uuid,
      p_snapshot jsonb,
      p_task_payload jsonb
    )
    returns jsonb
    language plpgsql
    stable
    security definer
    set search_path = ''
    as %L
  $function$, function_body);
end
$migration$;

commit;

-- ─── Assert the patch actually took ─────────────────────────────────────────
do $verify$
declare
  body text;
begin
  select prosrc into body
  from pg_catalog.pg_proc
  where oid = (
    'app_private.learner_snapshot_task_lock_reasons(uuid,uuid,uuid,text,uuid,jsonb,jsonb)'
  )::regprocedure;

  if position('anchor_decided_at timestamptz;' in body) = 0
     or position('required_task_title' in body) = 0
     or position('make_interval' in body) = 0 then
    raise exception 'lock-reason patch did not apply cleanly'
      using errcode = '55000';
  end if;
  raise notice 'lock-reason function carries relative scheduling and enrichment';
end
$verify$;
