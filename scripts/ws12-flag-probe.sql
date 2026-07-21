-- ═══════════════════════════════════════════════════════════════════════════
-- WS-12 probe — `public.flag_learner_to_trainer` under real sessions.
--
--   PGPASSWORD=postgres psql "postgresql://postgres@192.168.178.75:56722/postgres?sslmode=disable" \
--     -v ON_ERROR_STOP=1 -f scripts/ws12-flag-probe.sql
--
-- ONE transaction, ROLLED BACK. This one really does write notifications and
-- audit rows, so it must never be converted to a committing script.
--
-- What it asserts:
--   §1  an admin notifies the course's trainers, and the RIGHT trainers
--   §2  a second flag the same day notifies nobody and reports `repeated`
--   §3  a LEARNER is refused          ← the only guard on a definer write
--   §4  a TRAINER is refused          ← flagging yourself is not a feature
--   §5  a blank note is refused
--   §6  the action leaves an audit_events row
-- ═══════════════════════════════════════════════════════════════════════════

begin;

\set ON_ERROR_STOP on

do $probe$
declare
  admin_uid   constant uuid := '01980a00-0000-7000-8000-000000000003';
  trainer_uid constant uuid := '01980a00-0000-7000-8000-000000000002';
  learner_uid constant uuid := '01980a00-0000-7000-8000-000000000001';
  target_enrollment uuid;
  target_course uuid;
  outcome jsonb;
  expected_trainers integer;
  actual_recipients integer;
  audit_rows integer;
  problems text[] := array[]::text[];
begin
  -- A learner whose course actually has a trainer, or §1 proves nothing.
  select enrollment.id, enrollment.course_id
  into target_enrollment, target_course
  from public.enrollments enrollment
  where enrollment.state in ('approved', 'assigned')
    and exists (
      select 1 from public.course_trainers assignment
      where assignment.course_id = enrollment.course_id
        and assignment.removed_at is null
    )
  limit 1;

  if target_enrollment is null then
    raise exception 'no enrollment on a course with an assigned trainer — cannot probe';
  end if;

  select count(*) into expected_trainers
  from public.course_trainers assignment
  where assignment.course_id = target_course and assignment.removed_at is null;

  -- ── §1 admin flags ───────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_uid)::text, true);

  outcome := public.flag_learner_to_trainer(
    target_enrollment, 'Seit zwei Wochen keine Aktivität. Bitte einmal nachfassen.', null);

  if (outcome ->> 'notified')::integer <> expected_trainers then
    problems := problems || format('§1 notified %s, expected %s',
      outcome ->> 'notified', expected_trainers);
  else
    raise notice '§1 ok — % trainer(s) notified', outcome ->> 'notified';
  end if;

  -- The right people, not merely the right number.
  select count(*) into actual_recipients
  from public.notifications notification
  where notification.event_type = 'learner.flagged'
    and notification.recipient_id in (
      select assignment.trainer_id from public.course_trainers assignment
      where assignment.course_id = target_course and assignment.removed_at is null
    );
  if actual_recipients <> expected_trainers then
    problems := problems || format(
      '§1 %s notifications landed on assigned trainers, expected %s',
      actual_recipients, expected_trainers);
  else
    raise notice '§1 ok — every notification went to an assigned trainer';
  end if;

  -- ── §2 the same flag again, same day ─────────────────────────────────────
  outcome := public.flag_learner_to_trainer(
    target_enrollment, 'Nochmal geklickt.', null);

  if (outcome ->> 'notified')::integer <> 0 then
    problems := problems || format(
      '§2 a repeat flag notified %s — the daily dedup is not holding',
      outcome ->> 'notified');
  elsif (outcome ->> 'repeated')::boolean is not true then
    problems := problems || '§2 a repeat flag did not report `repeated`';
  else
    raise notice '§2 ok — a repeat flag notifies nobody and says so';
  end if;

  -- ── §3 learner ───────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', learner_uid)::text, true);
  begin
    perform public.flag_learner_to_trainer(target_enrollment, 'Ich bin kein Admin.', null);
    problems := problems
      || '§3 PRIVILEGE LEAK: a learner can write into a trainer''s notifications';
  exception when insufficient_privilege then
    raise notice '§3 ok — a learner is refused';
  end;

  -- ── §4 trainer ───────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', trainer_uid)::text, true);
  begin
    perform public.flag_learner_to_trainer(target_enrollment, 'Ich melde mir selbst.', null);
    problems := problems || '§4 a trainer can flag — that only notifies themselves';
  exception when insufficient_privilege then
    raise notice '§4 ok — a trainer is refused';
  end;

  -- ── §5 blank note ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_uid)::text, true);
  begin
    perform public.flag_learner_to_trainer(target_enrollment, '   ', null);
    problems := problems || '§5 a blank note was accepted';
  exception when others then
    if sqlstate = '22023' then
      raise notice '§5 ok — a blank note is refused with 22023';
    else
      problems := problems || format('§5 blank note raised %s, expected 22023', sqlstate);
    end if;
  end;

  -- ── §6 audit trail ───────────────────────────────────────────────────────
  select count(*) into audit_rows
  from public.audit_events event
  where event.event_type = 'learner.flagged'
    and event.aggregate_id = target_enrollment;
  if audit_rows = 0 then
    problems := problems || '§6 no audit_events row was written';
  else
    raise notice '§6 ok — % audit row(s) written', audit_rows;
  end if;

  if array_length(problems, 1) > 0 then
    raise exception E'WS-12 flag probe FAILED:\n  %',
      array_to_string(problems, E'\n  ');
  end if;
  raise notice 'WS-12 flag probe: all sections passed';
end
$probe$;

rollback;
