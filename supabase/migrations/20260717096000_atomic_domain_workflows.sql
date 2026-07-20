-- User-facing workflow functions derive actor identity from auth.uid(), enforce
-- CAS/idempotency, and write audit/outbox effects in the same transaction.

create or replace function app_private.validate_attempt_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = old.state then
    return new;
  end if;
  if not (
    (old.state = 'in_progress' and new.state in ('submitted', 'abandoned'))
    or (old.state = 'submitted' and new.state in ('revision_required', 'accepted'))
    or (old.state = 'revision_required' and new.state in ('resubmitted', 'abandoned'))
    or (old.state = 'resubmitted' and new.state in ('revision_required', 'accepted'))
  ) then
    raise exception 'invalid attempt transition: % -> %', old.state, new.state using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_attempt_transition() from public, anon, authenticated;

create trigger attempts_validate_transition
before update on public.attempts
for each row execute function app_private.validate_attempt_transition();

create or replace function public.request_enrollment(
  p_organization_id uuid,
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
  result public.enrollments;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if length(p_idempotency_key) not between 16 and 200 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;
  if not (select app_private.is_active_organization_member(p_organization_id)) then
    raise exception 'organization membership required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.state = 'active' and c.archived_at is null
      and (c.organization_id is null or c.organization_id = p_organization_id)
  ) then
    raise exception 'course is unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.entitlements e
    where e.organization_id = p_organization_id
      and (e.user_id is null or e.user_id = actor_id)
      and e.capability in ('catalog', 'learning')
      and e.valid_from <= statement_timestamp()
      and (e.valid_until is null or e.valid_until > statement_timestamp())
  ) then
    raise exception 'learning entitlement required' using errcode = '42501';
  end if;

  select e.* into result
  from public.enrollments e
  where e.learner_id = actor_id and e.idempotency_key = p_idempotency_key;
  if result.id is not null then
    return result;
  end if;

  select e.* into result
  from public.enrollments e
  where e.learner_id = actor_id
    and e.course_id = p_course_id
    and e.state in ('requested', 'approved', 'assigned')
  order by e.created_at desc
  limit 1;
  if result.id is not null then
    return result;
  end if;

  insert into public.enrollments (
    organization_id, learner_id, course_id, state, request_note, idempotency_key
  ) values (
    p_organization_id, actor_id, p_course_id, 'requested', p_request_note, p_idempotency_key
  ) returning * into result;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    result.organization_id, actor_id, 'learner', 'enrollment.requested', 'enrollment',
    result.id, result.row_version, app_private.uuid7(), '{}'::jsonb
  );

  return result;
exception
  when unique_violation then
    select e.* into result
    from public.enrollments e
    where e.learner_id = actor_id
      and (e.idempotency_key = p_idempotency_key or (e.course_id = p_course_id and e.state in ('requested', 'approved', 'assigned')))
    order by (e.idempotency_key = p_idempotency_key) desc, e.created_at desc
    limit 1;
    if result.id is null then raise; end if;
    return result;
end;
$$;

create or replace function public.save_attempt_draft(
  p_attempt_id uuid,
  p_expected_version bigint,
  p_answer_text text,
  p_selected_option_ids uuid[],
  p_evidence_draft jsonb
)
returns public.attempt_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  attempt_row public.attempts;
  result public.attempt_drafts;
begin
  if jsonb_typeof(p_evidence_draft) <> 'array' then
    raise exception 'evidence draft must be an array' using errcode = '22023';
  end if;

  select a.* into attempt_row
  from public.attempts a
  where a.id = p_attempt_id and a.learner_id = actor_id and a.state in ('in_progress', 'revision_required');
  if attempt_row.id is null then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(p_selected_option_ids) selected_id
    where not exists (
      select 1 from public.task_options option_row
      where option_row.id = selected_id and option_row.task_id = attempt_row.task_id
    )
  ) then
    raise exception 'selected option does not belong to the attempt task' using errcode = '22023';
  end if;

  if p_expected_version = 0 then
    insert into public.attempt_drafts (
      attempt_id, answer_text, selected_option_ids, evidence_draft, client_saved_at
    ) values (
      p_attempt_id, p_answer_text, p_selected_option_ids, p_evidence_draft, statement_timestamp()
    )
    on conflict (attempt_id) do nothing
    returning * into result;
  else
    update public.attempt_drafts d
    set answer_text = p_answer_text,
        selected_option_ids = p_selected_option_ids,
        evidence_draft = p_evidence_draft,
        client_saved_at = statement_timestamp()
    where d.attempt_id = p_attempt_id and d.row_version = p_expected_version
    returning d.* into result;
  end if;

  if result.attempt_id is null then
    raise exception 'draft is stale' using errcode = '40001';
  end if;
  update public.attempts set last_activity_at = statement_timestamp() where id = p_attempt_id;
  return result;
end;
$$;

create or replace function public.submit_attempt(
  p_attempt_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_answer_text text,
  p_selected_option_ids uuid[],
  p_evidence_refs uuid[],
  p_correlation_id uuid
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  attempt_row public.attempts;
  submission_row public.submissions;
  version_number integer;
  next_submission_state public.submission_state;
  next_attempt_state public.attempt_state;
begin
  select a.* into attempt_row
  from public.attempts a
  where a.id = p_attempt_id and a.learner_id = actor_id;
  if attempt_row.id is null then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select s.* into submission_row from public.submissions s where s.attempt_id = p_attempt_id;
  if submission_row.id is not null and exists (
    select 1 from public.submission_versions sv
    where sv.submission_id = submission_row.id and sv.idempotency_key = p_idempotency_key
  ) then
    return submission_row;
  end if;

  if attempt_row.row_version <> p_expected_version or attempt_row.state not in ('in_progress', 'revision_required') then
    raise exception 'attempt is stale or not submittable' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.task_schedules ts
    where ts.cohort_id = attempt_row.cohort_id and ts.task_id = attempt_row.task_id
      and (ts.available_from is null or ts.available_from <= statement_timestamp())
      and (ts.due_at is null or ts.due_at >= statement_timestamp())
  ) then
    raise exception 'task is not active' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(p_selected_option_ids) selected_id
    where not exists (select 1 from public.task_options o where o.id = selected_id and o.task_id = attempt_row.task_id)
  ) then
    raise exception 'invalid selected option' using errcode = '22023';
  end if;

  if submission_row.id is null then
    next_submission_state := 'submitted';
    next_attempt_state := 'submitted';
    version_number := 1;
    insert into public.submissions (
      organization_id, attempt_id, learner_id, cohort_id, task_id, state, latest_version_number
    ) values (
      attempt_row.organization_id, attempt_row.id, actor_id, attempt_row.cohort_id,
      attempt_row.task_id, next_submission_state, version_number
    ) returning * into submission_row;
  else
    next_submission_state := 'resubmitted';
    next_attempt_state := 'resubmitted';
    version_number := submission_row.latest_version_number + 1;
    update public.submissions s
    set state = next_submission_state, latest_version_number = version_number
    where s.id = submission_row.id and s.state = 'revision_required'
    returning s.* into submission_row;
    if submission_row.id is null then
      raise exception 'submission is not revision-ready' using errcode = '40001';
    end if;
  end if;

  insert into public.submission_versions (
    submission_id, version_number, idempotency_key, answer_text,
    selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
    task_snapshot, submitted_by
  )
  select
    submission_row.id, version_number, p_idempotency_key, p_answer_text,
    p_selected_option_ids, p_evidence_refs, attempt_row.elapsed_seconds, attempt_row.hint_used,
    jsonb_build_object(
      'task_id', task_row.id,
      'course_id', task_row.course_id,
      'stage_id', task_row.stage_id,
      'content_version_id', task_row.content_version_id,
      'task_kind', task_row.task_kind,
      'target_url', task_row.target_url
    ),
    actor_id
  from public.tasks task_row
  where task_row.id = attempt_row.task_id;

  update public.attempts
  set state = next_attempt_state, submitted_at = statement_timestamp(), last_activity_at = statement_timestamp()
  where id = attempt_row.id and row_version = p_expected_version;
  if not found then
    raise exception 'attempt became stale' using errcode = '40001';
  end if;

  delete from public.attempt_drafts where attempt_id = attempt_row.id;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    submission_row.organization_id, actor_id, 'learner', 'submission.submitted', 'submission',
    submission_row.id, submission_row.row_version, p_correlation_id,
    jsonb_build_object('version_number', version_number, 'state', submission_row.state)
  );
  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    submission_row.organization_id, 'submission', submission_row.id, submission_row.row_version,
    'submission.submitted.v1', 1, p_correlation_id,
    jsonb_build_object('submission_id', submission_row.id, 'learner_id', actor_id, 'cohort_id', submission_row.cohort_id, 'version_number', version_number)
  );

  return submission_row;
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

  target_state := case p_decision when 'accepted' then 'accepted' else 'revision_required' end;
  attempt_target := case p_decision when 'accepted' then 'accepted' else 'revision_required' end;
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

create or replace function public.create_question(
  p_cohort_id uuid,
  p_task_id uuid,
  p_subject text,
  p_body text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
  result public.questions;
begin
  select c.organization_id into organization_id
  from public.cohorts c
  join public.cohort_memberships cm on cm.cohort_id = c.id
  join public.task_schedules ts on ts.cohort_id = c.id and ts.task_id = p_task_id
  where c.id = p_cohort_id and cm.user_id = actor_id and cm.role = 'learner' and cm.state = 'active';
  if organization_id is null then
    raise exception 'question scope denied' using errcode = '42501';
  end if;
  select q.* into result from public.questions q where q.learner_id = actor_id and q.idempotency_key = p_idempotency_key;
  if result.id is not null then return result; end if;

  insert into public.questions (
    organization_id, learner_id, cohort_id, task_id, subject, idempotency_key
  ) values (
    organization_id, actor_id, p_cohort_id, p_task_id, p_subject, p_idempotency_key
  ) returning * into result;
  insert into public.question_messages (question_id, author_id, body, message_kind)
  values (result.id, actor_id, p_body, 'message');
  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    organization_id, actor_id, 'learner', 'question.created', 'question',
    result.id, result.row_version, p_correlation_id, jsonb_build_object('task_id', p_task_id, 'cohort_id', p_cohort_id)
  );
  return result;
end;
$$;

create or replace function public.archive_question(
  p_question_id uuid,
  p_expected_version bigint,
  p_correlation_id uuid
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result public.questions;
begin
  update public.questions q
  set state = 'archived', archived_at = statement_timestamp()
  where q.id = p_question_id and q.row_version = p_expected_version
    and q.state in ('open', 'assigned', 'answered', 'transferred')
    and (q.learner_id = actor_id or q.assigned_trainer_id = actor_id or (select app_private.can_train_cohort(q.cohort_id)))
  returning q.* into result;
  if result.id is null then raise exception 'question is stale or forbidden' using errcode = '40001'; end if;
  insert into public.audit_events (
    organization_id, actor_id, event_type, aggregate_type, aggregate_id,
    aggregate_version, correlation_id, metadata
  ) values (
    result.organization_id, actor_id, 'question.archived', 'question', result.id,
    result.row_version, p_correlation_id, '{}'::jsonb
  );
  return result;
end;
$$;

create or replace function public.publish_portfolio(
  p_portfolio_id uuid,
  p_expected_version bigint,
  p_verifier_token_hash text,
  p_snapshot jsonb,
  p_expires_at timestamptz,
  p_correlation_id uuid
)
returns public.portfolio_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  portfolio_row public.portfolios;
  result public.portfolio_publications;
  next_version integer;
begin
  if jsonb_typeof(p_snapshot) <> 'object' or length(p_verifier_token_hash) < 32 then
    raise exception 'invalid publication payload' using errcode = '22023';
  end if;
  update public.portfolios p
  set visibility = 'public'
  where p.id = p_portfolio_id and p.learner_id = actor_id and p.row_version = p_expected_version
  returning p.* into portfolio_row;
  if portfolio_row.id is null then raise exception 'portfolio is stale or forbidden' using errcode = '40001'; end if;
  select coalesce(max(pp.version_number), 0) + 1 into next_version from public.portfolio_publications pp where pp.portfolio_id = p_portfolio_id;
  insert into public.portfolio_publications (
    portfolio_id, version_number, verifier_token_hash, snapshot, published_by, expires_at
  ) values (
    p_portfolio_id, next_version, p_verifier_token_hash, p_snapshot, actor_id, p_expires_at
  ) returning * into result;
  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    portfolio_row.organization_id, actor_id, 'learner', 'portfolio.published', 'portfolio',
    portfolio_row.id, portfolio_row.row_version, p_correlation_id, jsonb_build_object('publication_id', result.id, 'version_number', next_version)
  );
  return result;
end;
$$;

create or replace function public.revoke_portfolio_publication(
  p_publication_id uuid,
  p_reason text,
  p_correlation_id uuid
)
returns public.portfolio_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
  result public.portfolio_publications;
begin
  update public.portfolio_publications publication
  set revoked_at = statement_timestamp()
  from public.portfolios portfolio
  where publication.id = p_publication_id
    and portfolio.id = publication.portfolio_id
    and portfolio.learner_id = actor_id
    and publication.revoked_at is null
  returning publication.* into result;
  if result.id is null then raise exception 'publication not found or forbidden' using errcode = '42501'; end if;
  select p.organization_id into organization_id from public.portfolios p where p.id = result.portfolio_id;
  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, correlation_id, metadata
  ) values (
    organization_id, actor_id, 'learner', 'portfolio.publication_revoked', 'portfolio_publication',
    result.id, p_correlation_id, jsonb_build_object('reason', p_reason)
  );
  return result;
end;
$$;

create or replace function public.transition_cohort(
  p_cohort_id uuid,
  p_expected_version bigint,
  p_target_state public.cohort_state,
  p_reason text,
  p_correlation_id uuid
)
returns public.cohorts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result public.cohorts;
begin
  update public.cohorts c
  set state = p_target_state,
      completed_at = case when p_target_state = 'completed' then statement_timestamp() else c.completed_at end
  where c.id = p_cohort_id and c.row_version = p_expected_version
    and (select app_private.has_permission('cohort.manage', c.organization_id, c.id))
  returning c.* into result;
  if result.id is null then raise exception 'cohort is stale or forbidden' using errcode = '40001'; end if;
  insert into public.audit_events (
    organization_id, actor_id, event_type, aggregate_type, aggregate_id,
    aggregate_version, correlation_id, metadata
  ) values (
    result.organization_id, actor_id, 'cohort.state_changed', 'cohort', result.id,
    result.row_version, p_correlation_id, jsonb_build_object('state', result.state, 'reason', p_reason)
  );
  return result;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.request_enrollment(uuid,uuid,text,text)',
    'public.save_attempt_draft(uuid,bigint,text,uuid[],jsonb)',
    'public.submit_attempt(uuid,bigint,text,text,uuid[],uuid[],uuid)',
    'public.decide_submission(uuid,uuid,bigint,public.review_decision,text,text,uuid)',
    'public.create_question(uuid,uuid,text,text,text,uuid)',
    'public.archive_question(uuid,bigint,uuid)',
    'public.publish_portfolio(uuid,bigint,text,jsonb,timestamptz,uuid)',
    'public.revoke_portfolio_publication(uuid,text,uuid)',
    'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated, service_role', function_signature);
  end loop;
end $$;

