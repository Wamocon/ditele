-- Learner course and task ratings as actor-derived, enrollment-scoped, idempotent
-- commands. Direct table writes are revoked so a browser cannot rate content it is
-- not enrolled in, forge ownership, or bypass optimistic concurrency. Each command
-- upserts exactly one rating (expected_version 0 creates, a positive version updates
-- with compare-and-set) and records an append-only receipt plus one audit event.

-- One private receipt ledger binds an actor-scoped idempotency key to one canonical
-- rating payload. Results contain only mutation metadata, never another learner's
-- rating content.
create table public.rating_command_receipts (
  id uuid primary key default app_private.uuid7(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in ('rating.course', 'rating.task')),
  aggregate_id uuid,
  idempotency_key text not null check (
    length(idempotency_key) between 16 and 200
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint rating_command_receipts_actor_operation_key_unique
    unique (actor_id, operation, idempotency_key)
);

create index rating_command_receipts_actor_time_idx
  on public.rating_command_receipts (actor_id, created_at desc);

alter table public.rating_command_receipts enable row level security;
alter table public.rating_command_receipts force row level security;
revoke all on public.rating_command_receipts from public, anon, authenticated;
grant select on public.rating_command_receipts to service_role;

create trigger rating_command_receipts_immutable
before update or delete on public.rating_command_receipts
for each row execute function app_private.reject_mutation();

-- Course rating: the learner must hold an assigned or completed enrollment for the
-- exact course. The organization scope is derived from that enrollment, never from
-- the caller.
create or replace function public.rate_course(
  p_course_id uuid,
  p_score integer,
  p_comment text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  normalized_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  enrollment_row public.enrollments;
  rating_row public.ratings;
  receipt_row public.rating_command_receipts;
  payload_hash text;
  result_payload jsonb;
begin
  if v_actor_id is null
     or not (select app_private.current_actor_has_active_profile()) then
    raise exception 'course rating scope denied' using errcode = '42501';
  end if;
  if p_course_id is null
     or p_score is null or p_score < 1 or p_score > 5
     or (normalized_comment is not null and length(normalized_comment) > 2000)
     or p_expected_version is null or p_expected_version < 0
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid course, score, CAS, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'course_id', p_course_id,
      'score', p_score,
      'comment', normalized_comment,
      'expected_version', p_expected_version
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':rating.course:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.rating_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'rating.course'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different rating payload'
        using errcode = '22023';
    end if;
    return receipt_row.result;
  end if;

  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  where enrollment_record.learner_id = v_actor_id
    and enrollment_record.course_id = p_course_id
    and enrollment_record.state in ('assigned', 'completed')
  order by enrollment_record.created_at desc
  limit 1;
  if enrollment_row.id is null then
    raise exception 'course rating scope denied' using errcode = '42501';
  end if;

  if p_expected_version = 0 then
    insert into public.ratings (
      organization_id, learner_id, course_id, task_id, score, comment
    ) values (
      enrollment_row.organization_id, v_actor_id, p_course_id, null,
      p_score, normalized_comment
    )
    on conflict (learner_id, course_id) where course_id is not null do nothing
    returning * into rating_row;
    if rating_row.id is null then
      raise exception 'rating is stale or already exists' using errcode = '40001';
    end if;
  else
    update public.ratings rating_record
    set score = p_score, comment = normalized_comment
    where rating_record.learner_id = v_actor_id
      and rating_record.course_id = p_course_id
      and rating_record.row_version = p_expected_version
    returning rating_record.* into rating_row;
    if rating_row.id is null then
      raise exception 'rating is stale or unavailable' using errcode = '40001';
    end if;
  end if;

  result_payload := jsonb_build_object(
    'rating_id', rating_row.id,
    'row_version', rating_row.row_version,
    'score', rating_row.score
  );

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    rating_row.organization_id, v_actor_id, 'self', 'rating.submitted', 'rating',
    rating_row.id, rating_row.row_version, p_correlation_id,
    jsonb_build_object('target', 'course', 'course_id', p_course_id, 'score', p_score)
  );

  insert into public.rating_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'rating.course', rating_row.id, p_idempotency_key, payload_hash,
    result_payload, p_correlation_id
  );

  return result_payload;
end;
$$;

revoke all on function public.rate_course(uuid, integer, text, bigint, text, uuid)
  from public, anon;
grant execute on function public.rate_course(uuid, integer, text, bigint, text, uuid)
  to authenticated, service_role;

-- Task rating: the learner must hold an assigned or completed enrollment for the
-- course that owns the task. The organization scope is derived from that enrollment.
create or replace function public.rate_task(
  p_task_id uuid,
  p_score integer,
  p_comment text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  normalized_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  enrollment_row public.enrollments;
  rating_row public.ratings;
  receipt_row public.rating_command_receipts;
  payload_hash text;
  result_payload jsonb;
begin
  if v_actor_id is null
     or not (select app_private.current_actor_has_active_profile()) then
    raise exception 'task rating scope denied' using errcode = '42501';
  end if;
  if p_task_id is null
     or p_score is null or p_score < 1 or p_score > 5
     or (normalized_comment is not null and length(normalized_comment) > 2000)
     or p_expected_version is null or p_expected_version < 0
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid task, score, CAS, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'task_id', p_task_id,
      'score', p_score,
      'comment', normalized_comment,
      'expected_version', p_expected_version
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':rating.task:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.rating_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'rating.task'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different rating payload'
        using errcode = '22023';
    end if;
    return receipt_row.result;
  end if;

  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  join public.tasks task_record
    on task_record.course_id = enrollment_record.course_id
  where enrollment_record.learner_id = v_actor_id
    and task_record.id = p_task_id
    and enrollment_record.state in ('assigned', 'completed')
  order by enrollment_record.created_at desc
  limit 1;
  if enrollment_row.id is null then
    raise exception 'task rating scope denied' using errcode = '42501';
  end if;

  if p_expected_version = 0 then
    insert into public.ratings (
      organization_id, learner_id, course_id, task_id, score, comment
    ) values (
      enrollment_row.organization_id, v_actor_id, null, p_task_id,
      p_score, normalized_comment
    )
    on conflict (learner_id, task_id) where task_id is not null do nothing
    returning * into rating_row;
    if rating_row.id is null then
      raise exception 'rating is stale or already exists' using errcode = '40001';
    end if;
  else
    update public.ratings rating_record
    set score = p_score, comment = normalized_comment
    where rating_record.learner_id = v_actor_id
      and rating_record.task_id = p_task_id
      and rating_record.row_version = p_expected_version
    returning rating_record.* into rating_row;
    if rating_row.id is null then
      raise exception 'rating is stale or unavailable' using errcode = '40001';
    end if;
  end if;

  result_payload := jsonb_build_object(
    'rating_id', rating_row.id,
    'row_version', rating_row.row_version,
    'score', rating_row.score
  );

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    rating_row.organization_id, v_actor_id, 'self', 'rating.submitted', 'rating',
    rating_row.id, rating_row.row_version, p_correlation_id,
    jsonb_build_object('target', 'task', 'task_id', p_task_id, 'score', p_score)
  );

  insert into public.rating_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'rating.task', rating_row.id, p_idempotency_key, payload_hash,
    result_payload, p_correlation_id
  );

  return result_payload;
end;
$$;

revoke all on function public.rate_task(uuid, integer, text, bigint, text, uuid)
  from public, anon;
grant execute on function public.rate_task(uuid, integer, text, bigint, text, uuid)
  to authenticated, service_role;

-- Replace the permissive for-all self policy with a read-only ownership policy.
-- Organization managers retain read access for moderation and aggregate reporting.
-- Every write now flows through the rate_course / rate_task commands above.
drop policy if exists ratings_scoped on public.ratings;
create policy ratings_self_read on public.ratings
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or (select app_private.has_permission('organization.manage', organization_id))
  );
revoke insert, update, delete on public.ratings from authenticated;
