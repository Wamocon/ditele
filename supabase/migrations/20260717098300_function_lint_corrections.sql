-- Corrections from plpgsql_check: PostgreSQL has no min(uuid), and CASE text
-- results require explicit assignment casts to enum variables.

create or replace function public.request_enrollment(
  p_course_id uuid,
  p_idempotency_key text,
  p_request_note text default null
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  course_organization_id uuid;
  derived_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select c.organization_id into course_organization_id
  from public.courses c
  where c.id = p_course_id and c.state = 'active' and c.archived_at is null;
  if not found then
    raise exception 'course is unavailable' using errcode = '42501';
  end if;

  if course_organization_id is not null then
    select om.organization_id into derived_organization_id
    from public.organization_memberships om
    where om.user_id = actor_id
      and om.organization_id = course_organization_id
      and om.state = 'active'
      and (om.valid_until is null or om.valid_until > statement_timestamp());
  else
    select (array_agg(om.organization_id order by om.organization_id))[1]
    into derived_organization_id
    from public.organization_memberships om
    where om.user_id = actor_id
      and om.state = 'active'
      and (om.valid_until is null or om.valid_until > statement_timestamp())
    having count(*) = 1;
  end if;

  if derived_organization_id is null then
    raise exception 'a single active organization membership is required' using errcode = '42501';
  end if;

  return public.request_enrollment(
    derived_organization_id,
    p_course_id,
    p_idempotency_key,
    p_request_note
  );
end;
$$;

create or replace function public.decide_submission(
  p_submission_id uuid,
  p_submission_version_id uuid,
  p_expected_version bigint,
  p_decision public.review_decision,
  p_comment text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  submission_row public.submissions;
  target_state public.submission_state;
  attempt_target public.attempt_state;
begin
  if p_decision not in ('accepted', 'revision_required') or nullif(btrim(p_comment), '') is null then
    raise exception 'valid decision and comment are required' using errcode = '22023';
  end if;

  select s.* into submission_row from public.submissions s where s.id = p_submission_id;
  if submission_row.id is null or not (select app_private.can_train_cohort(submission_row.cohort_id)) then
    raise exception 'review scope denied' using errcode = '42501';
  end if;
  if exists (select 1 from public.reviews r where r.submission_id = p_submission_id and r.idempotency_key = p_idempotency_key) then
    return submission_row;
  end if;
  if submission_row.row_version <> p_expected_version or submission_row.state not in ('submitted', 'resubmitted') then
    raise exception 'submission is stale or not reviewable' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.submission_versions sv
    where sv.id = p_submission_version_id and sv.submission_id = submission_row.id
      and sv.version_number = submission_row.latest_version_number
  ) then
    raise exception 'review must target latest submission version' using errcode = '40001';
  end if;

  insert into public.reviews (
    organization_id, submission_id, submission_version_id, reviewer_id,
    decision, comment, idempotency_key, expected_submission_row_version
  ) values (
    submission_row.organization_id, submission_row.id, p_submission_version_id, actor_id,
    p_decision, p_comment, p_idempotency_key, p_expected_version
  );

  target_state := (case p_decision when 'accepted' then 'accepted' else 'revision_required' end)::public.submission_state;
  attempt_target := (case p_decision when 'accepted' then 'accepted' else 'revision_required' end)::public.attempt_state;
  update public.submissions s
  set state = target_state,
      accepted_at = case when target_state = 'accepted' then statement_timestamp() else null end
  where s.id = p_submission_id and s.row_version = p_expected_version
  returning s.* into submission_row;
  if submission_row.id is null then
    raise exception 'submission became stale' using errcode = '40001';
  end if;
  update public.attempts set state = attempt_target,
    accepted_at = case when attempt_target = 'accepted' then statement_timestamp() else null end
  where id = submission_row.attempt_id;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    submission_row.organization_id, actor_id, 'trainer', 'review.decided', 'submission',
    submission_row.id, submission_row.row_version, p_correlation_id,
    jsonb_build_object('decision', p_decision, 'submission_version_id', p_submission_version_id)
  );
  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    submission_row.organization_id, 'submission', submission_row.id, submission_row.row_version,
    'review.decided.v1', 1, p_correlation_id,
    jsonb_build_object('submission_id', submission_row.id, 'learner_id', submission_row.learner_id, 'decision', p_decision)
  );
  insert into public.notifications (organization_id, recipient_id, event_type, template_key, payload, deduplication_key)
  values (
    submission_row.organization_id, submission_row.learner_id, 'review.decided', 'notifications.review_decided',
    jsonb_build_object('submission_id', submission_row.id, 'decision', p_decision),
    'review:' || p_submission_version_id::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return submission_row;
end;
$$;

revoke all on function public.request_enrollment(uuid, text, text) from public, anon;
grant execute on function public.request_enrollment(uuid, text, text) to authenticated, service_role;
revoke all on function public.decide_submission(uuid, uuid, bigint, public.review_decision, text, text, uuid) from public, anon;
grant execute on function public.decide_submission(uuid, uuid, bigint, public.review_decision, text, text, uuid) to authenticated, service_role;

