-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1b, correction 3 — a removed learner could never be put back.
--
-- enroll_learner_in_course built its idempotency key from the two ids alone:
--
--     'admin-enrol:' || p_course_id || ':' || p_learner_id
--
-- and public.enrollments carries
--
--     enrollments_idempotency_uidx UNIQUE (learner_id, idempotency_key)
--
-- with no partial predicate — it covers cancelled rows too. So:
--
--     enrol      → row written, key taken
--     remove     → the row moves to 'cancelled'. It KEEPS the key.
--     re-enrol   → the "already on this course?" lookup only matches the live
--                  states, finds nothing, inserts... and hits 23505.
--
-- Permanently. An admin who removed the wrong person could not undo it through
-- any screen, and the error they saw was a raw unique-violation naming an
-- internal column.
--
-- Reusing the cancelled row instead is not available: validate_named_transition
-- allows assigned → cancelled and nothing back out of it, deliberately, because
-- an enrolment's history is a record of what happened rather than a slot to be
-- recycled. A second enrolment IS a second row.
--
-- So the key gets a unique suffix. The readable prefix stays, because
-- 'admin-enrol:…' in the audit trail is how you tell a direct admin enrolment
-- from an approved course request, and losing that to make the key opaque would
-- trade a real diagnostic for nothing.
--
-- Idempotency does not weaken. It never rested on this column: it rests on
-- enrollments_live_course_uidx, unique on (learner_id, course_id) across the
-- live states, and on the explicit lookup at the top of the command which
-- returns the existing row untouched. Both are exercised below.
--
--
-- AND THE SECOND COLLISION, ON THE WAY TO FIXING THE FIRST
--
-- With the key fixed, the same sequence failed again on a different constraint:
--
--     cohort_memberships_live_uidx UNIQUE (cohort_id, user_id, role)
--       WHERE state IN ('invited','active','suspended')
--
-- The command wrote the membership as an insert followed by a revive:
--
--     insert … on conflict do nothing;
--     update … set state='active', removed_at=null where state<>'active' …;
--
-- which is correct only while no removed row exists. After a removal the old
-- row sits at state='removed', OUTSIDE that partial index — so the insert does
-- not conflict, and adds a second row. The update then revives the first one,
-- and the pair lands two live memberships in an index that permits one.
--
-- Reordered to revive-then-insert-if-absent, which has no interleaving that
-- produces two: the revive touches at most one row (`limit 1`, in case history
-- ever left several dead ones), and the insert runs only when the revive found
-- nothing to bring back.
--
--
-- WHY psql DID NOT FIND EITHER OF THESE AND THE HTTP ROUND TRIP DID
--
-- Every earlier check ran inside one transaction that was rolled back, so the
-- first enrolment's key and membership never persisted past the test. Both
-- failures need the enrol to COMMIT, then a remove, then another enrol — which
-- is exactly the sequence a real admin performs across three requests, and
-- exactly what a rolled-back test cannot reproduce. The verification at the
-- bottom of this file therefore commits as it goes and cleans up afterwards.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $fix$
declare
  function_body text;
  before_text constant text :=
    '      ''admin-enrol:'' || p_course_id::text || '':'' || p_learner_id::text';
  after_text constant text :=
    '      ''admin-enrol:'' || p_course_id::text || '':'' || p_learner_id::text'
    || ' || '':'' || app_private.uuid7()::text';
  occurrences integer;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname = 'enroll_learner_in_course';

  if function_body is null then
    raise exception 'enroll_learner_in_course not found' using errcode = '55000';
  end if;
  -- Each half is guarded independently. They were written in two passes — the
  -- key fix, then the membership fix the key fix exposed — so a database that
  -- already has one of them must still receive the other.
  if position('|| '':'' || app_private.uuid7()::text' in function_body) = 0 then
    occurrences := (length(function_body) - length(replace(function_body, before_text, '')))
                   / length(before_text);
    if occurrences <> 1 then
      raise exception
        'expected exactly 1 idempotency key expression, found %', occurrences
        using errcode = '55000';
    end if;
    function_body := replace(function_body, before_text, after_text);
  end if;

  -- ── the membership half ────────────────────────────────────────────────
  declare
    membership_before constant text :=
      '  insert into public.cohort_memberships (' || E'\n'
      || '    cohort_id, user_id, role, state, assigned_by, assigned_at' || E'\n'
      || '  ) values (' || E'\n'
      || '    target_cohort_id, p_learner_id, ''learner'', ''active'', actor_id,' || E'\n'
      || '    statement_timestamp()' || E'\n'
      || '  )' || E'\n'
      || '  on conflict do nothing;' || E'\n'
      || E'\n'
      || '  update public.cohort_memberships membership' || E'\n'
      || '  set state = ''active'', removed_at = null, assigned_by = actor_id' || E'\n'
      || '  where membership.cohort_id = target_cohort_id' || E'\n'
      || '    and membership.user_id = p_learner_id' || E'\n'
      || '    and membership.role = ''learner''' || E'\n'
      || '    and (membership.state <> ''active'' or membership.removed_at is not null);';
    membership_after constant text :=
      -- Revive first. At most one row, because cohort_memberships_live_uidx
      -- permits exactly one live membership per (cohort, user, role) and two
      -- revived at once would violate it.
      '  update public.cohort_memberships membership' || E'\n'
      || '  set state = ''active'', removed_at = null, assigned_by = actor_id,' || E'\n'
      || '      updated_at = statement_timestamp()' || E'\n'
      || '  where membership.id = (' || E'\n'
      || '    select candidate.id' || E'\n'
      || '    from public.cohort_memberships candidate' || E'\n'
      || '    where candidate.cohort_id = target_cohort_id' || E'\n'
      || '      and candidate.user_id = p_learner_id' || E'\n'
      || '      and candidate.role = ''learner''' || E'\n'
      || '    order by candidate.assigned_at desc' || E'\n'
      || '    limit 1' || E'\n'
      || '  )' || E'\n'
      || '    and (membership.state <> ''active'' or membership.removed_at is not null);' || E'\n'
      || E'\n'
      -- ...and insert ONLY when there was nothing to revive. `on conflict do
      -- nothing` cannot stand in for this: a removed row sits outside the
      -- partial index, so the insert would not conflict and the pair would
      -- leave two live memberships.
      || '  insert into public.cohort_memberships (' || E'\n'
      || '    cohort_id, user_id, role, state, assigned_by, assigned_at' || E'\n'
      || '  )' || E'\n'
      || '  select target_cohort_id, p_learner_id, ''learner'', ''active'', actor_id,' || E'\n'
      || '         statement_timestamp()' || E'\n'
      || '  where not exists (' || E'\n'
      || '    select 1 from public.cohort_memberships existing' || E'\n'
      || '    where existing.cohort_id = target_cohort_id' || E'\n'
      || '      and existing.user_id = p_learner_id' || E'\n'
      || '      and existing.role = ''learner''' || E'\n'
      || '  );';
    membership_hits integer;
  begin
    if position('order by candidate.assigned_at desc' in function_body) = 0 then
      membership_hits := (length(function_body)
                          - length(replace(function_body, membership_before, '')))
                         / length(membership_before);
      if membership_hits <> 1 then
        raise exception
          'expected exactly 1 membership insert/revive pair, found % — the '
          'deployed body has changed and this patch must be re-read',
          membership_hits using errcode = '55000';
      end if;
      function_body := replace(function_body, membership_before, membership_after);
    end if;
  end;

  execute format(
    'create or replace function public.enroll_learner_in_course('
    || 'p_course_id uuid, p_learner_id uuid, '
    || 'p_reason text default ''Vom Administrator zugewiesen'', '
    || 'p_correlation_id uuid default null) '
    || 'returns public.enrollments language plpgsql security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function public.enroll_learner_in_course(uuid, uuid, text, uuid)
    owner to postgres;
  grant execute on function public.enroll_learner_in_course(uuid, uuid, text, uuid)
    to authenticated;

  raise notice 'enrolment keys are unique per enrolment; re-enrolment works again';
end
$fix$;

commit;

-- ─── Verification: the exact sequence that failed, committed at each step ──
--
-- Run for real and cleaned up afterwards, because a rolled-back transaction is
-- what hid the bug in the first place. It runs as the table owner, so the RPC's
-- own permission check is not what is under test here — the key collision is.
-- ⚠️ Locals are named target_* here. `course_id` and `learner_id` are BOTH
-- columns of public.enrollments, and this build has already lost time to that
-- exact collision three times (20260729110000, 20260729120000, 20260730400000).
-- `where enrollment_record.learner_id = learner_id` resolves to the column and
-- raises 42702 — or, in a DELETE, would have matched every row.
do $verify$
declare
  target_course_id uuid;
  target_learner_id uuid;
  first_enrolment uuid;
  second_enrolment uuid;
  live_count integer;
begin
  select version_record.course_id into target_course_id
  from public.content_versions version_record
  where version_record.state = 'published'
  order by version_record.version_number desc
  limit 1;

  -- A learner who is not on that course and is not needed by anything else.
  select profile_record.user_id into target_learner_id
  from public.profiles profile_record
  join public.organization_memberships membership
    on membership.user_id = profile_record.user_id
   and membership.state = 'active'
  where profile_record.state = 'active'
    and not exists (
      select 1 from public.enrollments enrollment_record
      where enrollment_record.learner_id = profile_record.user_id
        and enrollment_record.course_id = target_course_id
    )
  order by profile_record.created_at desc
  limit 1;

  if target_course_id is null or target_learner_id is null then
    raise notice 'no spare learner or published course; behavioural check skipped';
    return;
  end if;

  -- Impersonate so the command's auth.uid() is a real admin.
  perform set_config(
    'request.jwt.claims',
    (select json_build_object('sub', user_role.user_id, 'role', 'authenticated')::text
     from public.user_roles user_role
     join public.roles role_record on role_record.id = user_role.role_id
     where role_record.code = 'admin' and user_role.revoked_at is null
     limit 1),
    true
  );

  first_enrolment := (public.enroll_learner_in_course(target_course_id, target_learner_id)).id;
  perform public.remove_learner_from_course(target_course_id, target_learner_id);

  -- THE regression. Before this migration it raised 23505 on
  -- enrollments_idempotency_uidx and there was no way back.
  begin
    second_enrolment :=
      (public.enroll_learner_in_course(target_course_id, target_learner_id)).id;
  exception when unique_violation then
    raise exception
      're-enrolment after removal still collides on the idempotency key'
      using errcode = '55000';
  end;

  if second_enrolment = first_enrolment then
    raise exception 're-enrolment reused the cancelled row, which the state '
      'machine forbids' using errcode = '55000';
  end if;

  -- And idempotency still holds: a second call adds nothing.
  perform public.enroll_learner_in_course(target_course_id, target_learner_id);
  select count(*) into live_count
  from public.enrollments enrollment_record
  where enrollment_record.learner_id = target_learner_id
    and enrollment_record.course_id = target_course_id
    and enrollment_record.state in ('requested', 'approved', 'assigned');
  if live_count <> 1 then
    raise exception 'expected exactly 1 live enrolment, found %', live_count
      using errcode = '55000';
  end if;

  -- Leave the database as it was found. Only the rows this block created, and
  -- only the cancelled ones — a live enrolment here would belong to somebody.
  perform public.remove_learner_from_course(target_course_id, target_learner_id);
  delete from public.cohort_memberships membership
  where membership.user_id = target_learner_id
    and membership.state = 'removed'
    and not exists (
      select 1 from public.attempts attempt_record
      where attempt_record.learner_id = target_learner_id
        and attempt_record.cohort_id = membership.cohort_id
    );
  delete from public.enrollments enrollment_record
  where enrollment_record.learner_id = target_learner_id
    and enrollment_record.course_id = target_course_id
    and enrollment_record.state = 'cancelled'
    and not exists (
      select 1 from public.attempts attempt_record
      where attempt_record.enrollment_id = enrollment_record.id
    );

  raise notice 'Phase 1b correction 3 verified: remove then re-enrol works, '
    'and enrolling twice still yields one live enrolment';
end
$verify$;
