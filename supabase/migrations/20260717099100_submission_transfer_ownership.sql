-- WF-04: atomic submission review transfer and effective trainer ownership.

alter table public.review_transfers
  add column expected_submission_row_version bigint not null default 1
  check (expected_submission_row_version > 0);

alter table public.review_transfers
  alter column expected_submission_row_version drop default;

alter table public.review_transfers
  add constraint review_transfers_idempotency_length
  check (length(idempotency_key) between 16 and 200) not valid;

create or replace function app_private.is_active_cohort_review_trainer(
  p_user_id uuid,
  p_cohort_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.cohorts cohort_record
      join public.organizations organization_record
        on organization_record.id = cohort_record.organization_id
       and organization_record.state = 'active'
      join public.cohort_memberships cohort_membership
        on cohort_membership.cohort_id = cohort_record.id
       and cohort_membership.user_id = p_user_id
       and cohort_membership.role = 'trainer'
       and cohort_membership.state = 'active'
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = cohort_record.organization_id
       and organization_membership.user_id = p_user_id
       and organization_membership.state = 'active'
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      join public.profiles profile_record
        on profile_record.user_id = p_user_id
       and profile_record.state = 'active'
      where cohort_record.id = p_cohort_id
        and cohort_record.organization_id = p_organization_id
        and cohort_record.state = 'active'
        and exists (
          select 1
          from public.user_roles role_assignment
          join public.role_permissions role_permission
            on role_permission.role_id = role_assignment.role_id
          join public.permissions permission_record
            on permission_record.id = role_permission.permission_id
          where role_assignment.user_id = p_user_id
            and permission_record.code = 'review.manage'
            and role_assignment.revoked_at is null
            and role_assignment.valid_from <= statement_timestamp()
            and (
              role_assignment.valid_until is null
              or role_assignment.valid_until > statement_timestamp()
            )
            and (
              role_assignment.organization_id is null
              or role_assignment.organization_id = p_organization_id
            )
            and (
              role_assignment.cohort_id is null
              or role_assignment.cohort_id = p_cohort_id
            )
        )
    );
$$;

revoke all on function app_private.is_active_cohort_review_trainer(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.list_active_cohort_trainers(p_cohort_id uuid)
returns table (
  user_id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  cohort_organization_id uuid;
  actor_is_trainer boolean;
  actor_can_manage boolean;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select cohort_record.organization_id into cohort_organization_id
  from public.cohorts cohort_record
  join public.organizations organization_record
    on organization_record.id = cohort_record.organization_id
   and organization_record.state = 'active'
  where cohort_record.id = p_cohort_id
    and cohort_record.state = 'active';

  if cohort_organization_id is null then
    raise exception 'active cohort trainer scope denied' using errcode = '42501';
  end if;

  actor_is_trainer := app_private.is_active_cohort_review_trainer(
    actor_id, p_cohort_id, cohort_organization_id
  );
  actor_can_manage := app_private.has_permission(
    'cohort.manage', cohort_organization_id, p_cohort_id
  );

  if not actor_is_trainer and not actor_can_manage then
    raise exception 'active cohort trainer scope denied' using errcode = '42501';
  end if;

  return query
  select profile_record.user_id, profile_record.display_name
  from public.profiles profile_record
  where app_private.is_active_cohort_review_trainer(
    profile_record.user_id, p_cohort_id, cohort_organization_id
  )
  order by lower(profile_record.display_name), profile_record.user_id;
end;
$$;

revoke all on function public.list_active_cohort_trainers(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_active_cohort_trainers(uuid)
  to authenticated, service_role;

create or replace function public.transfer_submission(
  p_submission_id uuid,
  p_expected_version bigint,
  p_to_trainer_id uuid,
  p_reason text,
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
  normalized_reason text := btrim(p_reason);
  submission_row public.submissions;
  existing_transfer public.review_transfers;
  latest_transfer public.review_transfers;
  transfer_row public.review_transfers;
  actor_is_trainer boolean;
  actor_can_manage boolean;
  actor_role_name text;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_expected_version is null
     or p_expected_version <= 0
     or p_to_trainer_id is null
     or p_to_trainer_id = actor_id
     or nullif(normalized_reason, '') is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'a current version, different target trainer, reason, idempotency key and correlation id are required'
      using errcode = '22023';
  end if;

  select submission_record.* into submission_row
  from public.submissions submission_record
  join public.cohorts cohort_record
    on cohort_record.id = submission_record.cohort_id
   and cohort_record.organization_id = submission_record.organization_id
   and cohort_record.state = 'active'
  join public.organizations organization_record
    on organization_record.id = submission_record.organization_id
   and organization_record.state = 'active'
  join public.tasks task_record
    on task_record.id = submission_record.task_id
   and task_record.course_id = cohort_record.course_id
  where submission_record.id = p_submission_id
  for update of submission_record;

  if submission_row.id is null then
    raise exception 'submission transfer scope denied' using errcode = '42501';
  end if;

  actor_is_trainer := app_private.is_active_cohort_review_trainer(
    actor_id, submission_row.cohort_id, submission_row.organization_id
  );
  actor_can_manage := app_private.has_permission(
    'cohort.manage', submission_row.organization_id, submission_row.cohort_id
  );
  if not actor_is_trainer and not actor_can_manage then
    raise exception 'submission transfer scope denied' using errcode = '42501';
  end if;

  select transfer_record.* into existing_transfer
  from public.review_transfers transfer_record
  where transfer_record.submission_id = submission_row.id
    and transfer_record.idempotency_key = p_idempotency_key;
  if existing_transfer.id is not null then
    if existing_transfer.from_trainer_id <> actor_id then
      raise exception 'submission transfer scope denied' using errcode = '42501';
    end if;
    if existing_transfer.to_trainer_id <> p_to_trainer_id
       or existing_transfer.reason <> normalized_reason
       or existing_transfer.expected_submission_row_version <> p_expected_version then
      raise exception 'idempotency key was reused with a different transfer payload'
        using errcode = '22023';
    end if;
    return submission_row;
  end if;

  select transfer_record.* into latest_transfer
  from public.review_transfers transfer_record
  where transfer_record.submission_id = submission_row.id
  order by transfer_record.created_at desc, transfer_record.id desc
  limit 1;
  if latest_transfer.id is not null
     and latest_transfer.to_trainer_id <> actor_id
     and not actor_can_manage then
    raise exception 'submission review ownership changed' using errcode = '42501';
  end if;

  if submission_row.row_version <> p_expected_version
     or submission_row.state not in ('submitted', 'resubmitted') then
    raise exception 'submission is stale or not transferable' using errcode = '40001';
  end if;

  if not app_private.is_active_cohort_review_trainer(
    p_to_trainer_id, submission_row.cohort_id, submission_row.organization_id
  ) then
    raise exception 'target trainer is not active in the submission cohort and tenant'
      using errcode = '23514';
  end if;

  update public.submissions submission_record
  set updated_at = statement_timestamp()
  where submission_record.id = submission_row.id
    and submission_record.row_version = p_expected_version
    and submission_record.state in ('submitted', 'resubmitted')
  returning submission_record.* into submission_row;
  if submission_row.id is null then
    raise exception 'submission became stale' using errcode = '40001';
  end if;

  insert into public.review_transfers (
    organization_id, submission_id, from_trainer_id, to_trainer_id,
    reason, idempotency_key, expected_submission_row_version
  ) values (
    submission_row.organization_id, submission_row.id, actor_id, p_to_trainer_id,
    normalized_reason, p_idempotency_key, p_expected_version
  ) returning * into transfer_row;

  actor_role_name := case
    when actor_can_manage and not actor_is_trainer then 'cohort_manager'
    else 'trainer'
  end;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    submission_row.organization_id, actor_id, actor_role_name,
    'submission.transferred', 'submission', submission_row.id,
    submission_row.row_version, p_correlation_id,
    jsonb_build_object(
      'transfer_id', transfer_row.id,
      'from_trainer_id', actor_id,
      'to_trainer_id', p_to_trainer_id,
      'cohort_id', submission_row.cohort_id,
      'reason', normalized_reason,
      'manager_override', actor_can_manage and not actor_is_trainer
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    submission_row.organization_id, 'submission', submission_row.id,
    submission_row.row_version, 'submission.transferred.v1', 1,
    p_correlation_id,
    jsonb_build_object(
      'submission_id', submission_row.id,
      'transfer_id', transfer_row.id,
      'learner_id', submission_row.learner_id,
      'from_trainer_id', actor_id,
      'to_trainer_id', p_to_trainer_id,
      'cohort_id', submission_row.cohort_id,
      'task_id', submission_row.task_id
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  ) values (
    submission_row.organization_id,
    p_to_trainer_id,
    'submission.transferred',
    'notifications.submission_transferred',
    jsonb_build_object(
      'submission_id', submission_row.id,
      'transfer_id', transfer_row.id,
      'cohort_id', submission_row.cohort_id,
      'task_id', submission_row.task_id
    ),
    'submission-transfer:' || transfer_row.id::text || ':trainer'
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return submission_row;
end;
$$;

-- Submission and review state are mutated only by the actor-derived RPCs. The
-- older broad table grants would otherwise permit a learner state bypass or a
-- stale trainer to reserve a submission version with a forged review row.
revoke insert, update, delete on public.submissions from authenticated;
revoke insert, update, delete on public.reviews from authenticated;
revoke insert, update, delete on public.review_transfers from authenticated;
revoke all on function public.transfer_submission(uuid, bigint, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.transfer_submission(uuid, bigint, uuid, text, text, uuid)
  to authenticated, service_role;

-- Preserve the reviewed rubric/evidence/mastery implementation as an internal
-- effect function. The public wrapper below adds effective transfer ownership
-- while retaining the established public signature and return type.
alter function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) rename to decide_submission_effects_unowned;

alter function public.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) set schema app_private;

revoke all on function app_private.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.decide_submission(
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
as $$
declare
  actor_id uuid := (select auth.uid());
  submission_row public.submissions;
  latest_transfer public.review_transfers;
  actor_is_trainer boolean;
  actor_can_manage boolean;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select submission_record.* into submission_row
  from public.submissions submission_record
  join public.cohorts cohort_record
    on cohort_record.id = submission_record.cohort_id
   and cohort_record.organization_id = submission_record.organization_id
   and cohort_record.state = 'active'
  join public.organizations organization_record
    on organization_record.id = submission_record.organization_id
   and organization_record.state = 'active'
  join public.tasks task_record
    on task_record.id = submission_record.task_id
   and task_record.course_id = cohort_record.course_id
  where submission_record.id = p_submission_id
  for update of submission_record;

  if submission_row.id is null then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  actor_is_trainer := app_private.is_active_cohort_review_trainer(
    actor_id, submission_row.cohort_id, submission_row.organization_id
  );
  actor_can_manage := app_private.has_permission(
    'cohort.manage', submission_row.organization_id, submission_row.cohort_id
  );
  if not actor_is_trainer and not actor_can_manage then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  select transfer_record.* into latest_transfer
  from public.review_transfers transfer_record
  where transfer_record.submission_id = submission_row.id
  order by transfer_record.created_at desc, transfer_record.id desc
  limit 1;
  if latest_transfer.id is not null
     and latest_transfer.to_trainer_id <> actor_id
     and not actor_can_manage then
    raise exception 'submission review ownership changed' using errcode = '42501';
  end if;

  return app_private.decide_submission_effects_unowned(
    p_submission_id,
    p_submission_version_id,
    p_expected_version,
    p_decision,
    p_comment,
    p_criterion_scores,
    p_idempotency_key,
    p_correlation_id
  );
end;
$$;

revoke all on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) to authenticated, service_role;
