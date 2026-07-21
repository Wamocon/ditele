-- ═══════════════════════════════════════════════════════════════════════════
-- WS-12 — "Trainer benachrichtigen". `05_…` §G10, `06_…` §8 WS-12 item 3.
--
-- The board's one write. An admin who spots a stalled or stuck learner hands
-- them to the human who can actually help: the trainer assigned to that
-- learner's course in `course_trainers`.
--
-- ── Why this is an RPC and not an insert ──────────────────────────────────
--
-- `RPC_CONTRACTS.md` §0.6: `notifications` has no DML grant for anyone. An
-- `.from("notifications").insert(...)` fails with 42501 at runtime, in
-- production, on a user action — it compiles, it lints, and it dies in front of
-- an administrator. Every mutation in this codebase goes through a command RPC
-- and this one is no exception.
--
-- ── Why there is no `p_idempotency_key` ───────────────────────────────────
--
-- Almost every mutation here takes one (`RPC_CONTRACTS.md` §0.1), and leaving
-- it out is a deliberate departure worth reading before copying.
--
-- A client-supplied key protects against a double-submit. It does NOT protect
-- against the thing that actually goes wrong here — an admin clicking
-- "benachrichtigen" on the same learner five times in an afternoon, because a
-- fresh key each click is, correctly, five distinct requests. The dedup this
-- action needs is per (enrollment, day), and only the server can derive it.
-- `notifications_deduplication_unique (recipient_id, deduplication_key)` then
-- does the enforcement, in the database, where a retry cannot get around it.
--
-- So: one notification per learner per trainer per day, and tomorrow's genuine
-- second flag still gets through. The function reports whether it actually
-- notified anyone, so the UI can say "already sent today" instead of lying
-- about having sent something.
--
-- Forward-only and idempotent. No data change; `create or replace` only.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.flag_learner_to_trainer(
  p_enrollment_id uuid,
  p_note text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $flag$
declare
  actor_id uuid := (select auth.uid());
  enrollment_row public.enrollments;
  learner_name text;
  course_title text;
  note text := btrim(coalesce(p_note, ''));
  dedup_key text;
  notified integer := 0;
  trainer_count integer := 0;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if length(note) = 0 then
    raise exception 'a note is required' using errcode = '22023';
  end if;
  -- Long enough for real context, short enough that nobody pastes a transcript
  -- into a notification payload.
  if length(note) > 1000 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  select * into enrollment_row
  from public.enrollments enrollment
  where enrollment.id = p_enrollment_id;

  if not found then
    -- Deliberately the same error as "you may not". A distinguishable
    -- not-found tells an unauthorized caller which enrollment ids exist.
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- ⚠️ Only an administrator may flag. A trainer flagging a learner would be
  -- notifying themselves, and a learner must never reach this at all — this is
  -- `security definer`, so the check below is the ONLY thing standing between a
  -- learner and the ability to write into another user's notification feed.
  if not (
    app_private.has_role('admin', enrollment_row.organization_id)
    or app_private.has_role('organization_admin', enrollment_row.organization_id)
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select coalesce(profile.display_name, '') into learner_name
  from public.profiles profile
  where profile.user_id = enrollment_row.learner_id;

  select localization.title into course_title
  from public.course_localizations localization
  where localization.course_id = enrollment_row.course_id
  order by (localization.locale = 'de') desc, localization.locale
  limit 1;

  -- One flag per enrollment per day, derived server-side. See the header.
  dedup_key := 'learner-flag:' || p_enrollment_id::text || ':'
    || (timezone('UTC', statement_timestamp()))::date::text;

  select count(*) into trainer_count
  from public.course_trainers assignment
  where assignment.course_id = enrollment_row.course_id
    and assignment.removed_at is null;

  with recipients as (
    select assignment.trainer_id
    from public.course_trainers assignment
    where assignment.course_id = enrollment_row.course_id
      and assignment.removed_at is null
  ),
  inserted as (
    insert into public.notifications (
      organization_id, recipient_id, event_type, template_key, payload, deduplication_key
    )
    select
      enrollment_row.organization_id,
      recipients.trainer_id,
      'learner.flagged',
      'notifications.learner_flagged',
      jsonb_build_object(
        'enrollment_id', enrollment_row.id,
        -- `course_id` is lifted by the notification list's payload reader into
        -- a deep link, so the trainer lands on the course rather than on a
        -- dead-end card.
        'course_id', enrollment_row.course_id,
        'course_title', coalesce(course_title, ''),
        'learner_name', learner_name,
        'note', note,
        'flagged_by', actor_id
      ),
      dedup_key
    from recipients
    on conflict (recipient_id, deduplication_key) do nothing
    returning 1
  )
  select count(*) into notified from inserted;

  -- I-015 records that several admin actions cannot write `audit_events`,
  -- because `authenticated` holds no INSERT grant on it. This function is
  -- `security definer` owned by `postgres`, so it can — and an action that
  -- names a specific learner to a third party is exactly the kind that should
  -- leave a trace.
  insert into public.audit_events (
    id, organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, correlation_id, metadata, occurred_at, created_at
  ) values (
    app_private.uuid7(), enrollment_row.organization_id, actor_id, 'admin',
    'learner.flagged', 'enrollment', enrollment_row.id,
    coalesce(p_correlation_id, app_private.uuid7()),
    jsonb_build_object(
      'learner_id', enrollment_row.learner_id,
      'course_id', enrollment_row.course_id,
      'trainers_notified', notified,
      'trainers_assigned', trainer_count
    ),
    statement_timestamp(), statement_timestamp()
  );

  return jsonb_build_object(
    'notified', notified,
    'trainers', trainer_count,
    -- Trainers exist and none was notified ⇒ today's flag is already out there.
    -- The UI needs this to say "already sent today" rather than claiming a
    -- send that the unique index quietly refused.
    'repeated', (trainer_count > 0 and notified = 0)
  );
end
$flag$;

comment on function public.flag_learner_to_trainer(uuid, text, uuid) is
  'WS-12: notify the course trainers that a learner needs attention. '
  'Admin only. Deduplicated server-side to one notification per enrollment '
  'per day, so a repeated click cannot spam a trainer.';

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------
--
-- ⚠️ `owner to postgres` is load-bearing: `notifications` carries FORCE ROW
-- LEVEL SECURITY and has no INSERT policy at all. Only `postgres` holds
-- `rolbypassrls`, so a definer function owned by any other role is silently
-- blocked by the very table it exists to write. (`plan/status/WS-11.md`,
-- learning 2 — the same trap that made the award engine's inserts possible.)

alter function public.flag_learner_to_trainer(uuid, text, uuid) owner to postgres;

revoke all on function public.flag_learner_to_trainer(uuid, text, uuid) from public, anon;
grant execute on function public.flag_learner_to_trainer(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify by effect  (`schema_migrations` does not describe reality — I-036)
-- ---------------------------------------------------------------------------

do $verify$
declare
  problems text[] := array[]::text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace space on space.oid = proc.pronamespace
    where space.nspname = 'public' and proc.proname = 'flag_learner_to_trainer'
      and proc.prosecdef
      and pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
  ) then
    problems := problems
      || 'flag_learner_to_trainer is missing, not definer, or not owned by postgres';
  end if;

  -- The dedup guarantee depends entirely on this index. If a future migration
  -- drops it, this function silently becomes a spam cannon — so assert it here
  -- rather than trusting that it stays.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_deduplication_unique'
  ) then
    problems := problems
      || 'notifications_deduplication_unique is gone — the daily dedup cannot hold';
  end if;

  -- No auth.uid() as postgres, so this exercises the authentication guard.
  begin
    perform public.flag_learner_to_trainer(
      '00000000-0000-0000-0000-000000000000'::uuid, 'probe', null);
    problems := problems || 'flag_learner_to_trainer did not require authentication';
  exception
    when insufficient_privilege then null;   -- 42501, the expected path
  end;

  if array_length(problems, 1) > 0 then
    raise exception 'WS-12 flag verification failed: %', array_to_string(problems, '; ');
  end if;
  raise notice 'WS-12 flag-to-trainer verified';
end
$verify$;

commit;
