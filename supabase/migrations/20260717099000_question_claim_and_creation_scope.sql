-- WF-03 corrective boundary: verified learner creation and explicit trainer claim.

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
  derived_organization_id uuid;
  question_row public.questions;
  initial_message public.question_messages;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_cohort_id is null
     or p_task_id is null
     or nullif(btrim(p_subject), '') is null
     or nullif(btrim(p_body), '') is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid question subject, body, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  select cohort_record.organization_id into derived_organization_id
  from public.cohorts cohort_record
  join public.courses course_record
    on course_record.id = cohort_record.course_id
   and course_record.state = 'active'
   and course_record.archived_at is null
   and (course_record.organization_id is null
     or course_record.organization_id = cohort_record.organization_id)
  join public.tasks task_record
    on task_record.id = p_task_id
   and task_record.course_id = course_record.id
   and task_record.state = 'active'
  join public.stages stage_record
    on stage_record.id = task_record.stage_id
   and stage_record.course_id = course_record.id
   and stage_record.state = 'active'
  join public.cohort_memberships cohort_membership
    on cohort_membership.cohort_id = cohort_record.id
   and cohort_membership.user_id = actor_id
   and cohort_membership.role = 'learner'
   and cohort_membership.state = 'active'
  join public.enrollments enrollment_record
    on enrollment_record.organization_id = cohort_record.organization_id
   and enrollment_record.learner_id = actor_id
   and enrollment_record.course_id = course_record.id
   and enrollment_record.cohort_id = cohort_record.id
   and enrollment_record.state in ('assigned', 'completed')
  where cohort_record.id = p_cohort_id
    and cohort_record.state = 'active'
    and exists (
      select 1
      from public.organization_memberships organization_membership
      where organization_membership.organization_id = cohort_record.organization_id
        and organization_membership.user_id = actor_id
        and organization_membership.state = 'active'
        and (organization_membership.valid_until is null
          or organization_membership.valid_until > statement_timestamp())
    )
    and (select app_private.has_role(
      'learner', cohort_record.organization_id, cohort_record.id
    ))
    and (
      (
        cohort_record.progression_mode = 'scheduled'
        and exists (
          select 1
          from public.task_schedules schedule_record
          where schedule_record.cohort_id = cohort_record.id
            and schedule_record.task_id = task_record.id
            and (schedule_record.available_from is null
              or schedule_record.available_from <= statement_timestamp())
            and (schedule_record.due_at is null
              or schedule_record.due_at >= statement_timestamp())
        )
      )
      or (
        cohort_record.progression_mode = 'flexible'
        and exists (
          select 1
          from public.entitlements entitlement_record
          join public.product_packages package_record
            on package_record.id = entitlement_record.product_package_id
           and package_record.state = 'active'
           and 'learning' = any(package_record.capabilities)
          where entitlement_record.organization_id = cohort_record.organization_id
            and (entitlement_record.user_id is null
              or entitlement_record.user_id = actor_id)
            and entitlement_record.capability = 'learning'
            and entitlement_record.valid_from <= statement_timestamp()
            and (entitlement_record.valid_until is null
              or entitlement_record.valid_until > statement_timestamp())
        )
      )
    )
  limit 1;

  if derived_organization_id is null then
    raise exception 'question creation scope denied' using errcode = '42501';
  end if;

  insert into public.questions (
    organization_id, learner_id, cohort_id, task_id, assigned_trainer_id,
    state, subject, idempotency_key
  ) values (
    derived_organization_id, actor_id, p_cohort_id, p_task_id, null,
    'open', p_subject, p_idempotency_key
  )
  on conflict (learner_id, idempotency_key) do nothing
  returning * into question_row;

  if question_row.id is null then
    select existing_question.* into question_row
    from public.questions existing_question
    where existing_question.learner_id = actor_id
      and existing_question.idempotency_key = p_idempotency_key
    for update;

    select message_record.* into initial_message
    from public.question_messages message_record
    where message_record.question_id = question_row.id
      and message_record.author_id = actor_id
      and message_record.message_kind = 'message'
    order by message_record.created_at, message_record.id
    limit 1;

    if question_row.cohort_id <> p_cohort_id
       or question_row.task_id <> p_task_id
       or question_row.subject <> p_subject
       or initial_message.id is null
       or initial_message.body <> p_body then
      raise exception 'idempotency key was reused with a different question payload'
        using errcode = '22023';
    end if;
    return question_row;
  end if;

  insert into public.question_messages (
    question_id, author_id, body, message_kind
  ) values (
    question_row.id, actor_id, p_body, 'message'
  ) returning * into initial_message;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    derived_organization_id, actor_id, 'learner', 'question.created', 'question',
    question_row.id, question_row.row_version, p_correlation_id,
    jsonb_build_object(
      'cohort_id', p_cohort_id,
      'task_id', p_task_id,
      'initial_message_id', initial_message.id,
      'progression_mode', (
        select cohort_record.progression_mode
        from public.cohorts cohort_record
        where cohort_record.id = p_cohort_id
      )
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    derived_organization_id, 'question', question_row.id, question_row.row_version,
    'question.created.v1', 1, p_correlation_id,
    jsonb_build_object(
      'question_id', question_row.id,
      'learner_id', actor_id,
      'cohort_id', p_cohort_id,
      'task_id', p_task_id,
      'state', question_row.state
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  )
  select distinct
    derived_organization_id,
    trainer_membership.user_id,
    'question.opened',
    'notifications.question_open_for_claim',
    jsonb_build_object(
      'question_id', question_row.id,
      'cohort_id', p_cohort_id,
      'task_id', p_task_id
    ),
    'question-open:' || question_row.id::text
  from public.cohort_memberships trainer_membership
  join public.organization_memberships trainer_organization_membership
    on trainer_organization_membership.organization_id = derived_organization_id
   and trainer_organization_membership.user_id = trainer_membership.user_id
   and trainer_organization_membership.state = 'active'
   and (trainer_organization_membership.valid_until is null
     or trainer_organization_membership.valid_until > statement_timestamp())
  join public.user_roles role_assignment
    on role_assignment.user_id = trainer_membership.user_id
   and role_assignment.revoked_at is null
   and role_assignment.valid_from <= statement_timestamp()
   and (role_assignment.valid_until is null
     or role_assignment.valid_until > statement_timestamp())
   and (role_assignment.organization_id is null
     or role_assignment.organization_id = derived_organization_id)
   and (role_assignment.cohort_id is null
     or role_assignment.cohort_id = p_cohort_id)
  join public.role_permissions role_permission
    on role_permission.role_id = role_assignment.role_id
  join public.permissions permission_record
    on permission_record.id = role_permission.permission_id
   and permission_record.code = 'question.manage'
  where trainer_membership.cohort_id = p_cohort_id
    and trainer_membership.role = 'trainer'
    and trainer_membership.state = 'active'
  on conflict (recipient_id, deduplication_key) do nothing;

  return question_row;
end;
$$;

create or replace function public.claim_question(
  p_question_id uuid,
  p_expected_version bigint,
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
  question_row public.questions;
  claim_message public.question_messages;
  expected_history_body text;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_question_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid question, version, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  expected_history_body := 'Question claimed from version ' || p_expected_version::text;

  select question_record.* into question_row
  from public.questions question_record
  where question_record.id = p_question_id
  for update;

  if question_row.id is null
     or not exists (
       select 1
       from public.cohorts cohort_record
       join public.cohort_memberships cohort_membership
         on cohort_membership.cohort_id = cohort_record.id
        and cohort_membership.user_id = actor_id
        and cohort_membership.role = 'trainer'
        and cohort_membership.state = 'active'
       join public.tasks task_record
         on task_record.id = question_row.task_id
        and task_record.course_id = cohort_record.course_id
       where cohort_record.id = question_row.cohort_id
         and cohort_record.organization_id = question_row.organization_id
         and exists (
           select 1
           from public.organization_memberships organization_membership
           where organization_membership.organization_id = question_row.organization_id
             and organization_membership.user_id = actor_id
             and organization_membership.state = 'active'
             and (organization_membership.valid_until is null
               or organization_membership.valid_until > statement_timestamp())
         )
         and (select app_private.has_permission(
           'question.manage', question_row.organization_id, question_row.cohort_id
         ))
     ) then
    raise exception 'question claim scope denied' using errcode = '42501';
  end if;

  select message_record.* into claim_message
  from public.question_messages message_record
  where message_record.question_id = question_row.id
    and message_record.idempotency_key = p_idempotency_key;
  if claim_message.id is not null then
    if claim_message.author_id <> actor_id
       or claim_message.message_kind <> 'system' then
      raise exception 'question claim scope denied' using errcode = '42501';
    end if;
    if claim_message.body <> expected_history_body then
      raise exception 'idempotency key was reused with a different claim payload'
        using errcode = '22023';
    end if;
    return question_row;
  end if;

  if question_row.row_version <> p_expected_version
     or question_row.state <> 'open'
     or question_row.assigned_trainer_id is not null then
    raise exception 'question is stale or already claimed' using errcode = '40001';
  end if;

  update public.questions question_record
  set state = 'assigned',
      assigned_trainer_id = actor_id
  where question_record.id = question_row.id
    and question_record.row_version = p_expected_version
    and question_record.state = 'open'
    and question_record.assigned_trainer_id is null
  returning question_record.* into question_row;
  if question_row.id is null then
    raise exception 'question became stale' using errcode = '40001';
  end if;

  insert into public.question_messages (
    question_id, author_id, body, message_kind, idempotency_key
  ) values (
    question_row.id, actor_id, expected_history_body, 'system', p_idempotency_key
  ) returning * into claim_message;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    question_row.organization_id, actor_id, 'trainer', 'question.claimed', 'question',
    question_row.id, question_row.row_version, p_correlation_id,
    jsonb_build_object(
      'claim_message_id', claim_message.id,
      'cohort_id', question_row.cohort_id,
      'task_id', question_row.task_id,
      'expected_version', p_expected_version
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    question_row.organization_id, 'question', question_row.id, question_row.row_version,
    'question.claimed.v1', 1, p_correlation_id,
    jsonb_build_object(
      'question_id', question_row.id,
      'learner_id', question_row.learner_id,
      'trainer_id', actor_id,
      'cohort_id', question_row.cohort_id,
      'task_id', question_row.task_id,
      'claim_message_id', claim_message.id
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  ) values (
    question_row.organization_id,
    question_row.learner_id,
    'question.claimed',
    'notifications.question_claimed',
    jsonb_build_object(
      'question_id', question_row.id,
      'cohort_id', question_row.cohort_id,
      'task_id', question_row.task_id
    ),
    'question-claim:' || claim_message.id::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return question_row;
end;
$$;

-- Keep all state-changing writes behind actor-derived, audited RPCs.
revoke insert, update, delete on public.questions from authenticated;
revoke insert, update, delete on public.question_messages from authenticated;

revoke all on function public.create_question(uuid, uuid, text, text, text, uuid)
  from public, anon;
grant execute on function public.create_question(uuid, uuid, text, text, text, uuid)
  to authenticated, service_role;

revoke all on function public.claim_question(uuid, bigint, text, uuid)
  from public, anon;
grant execute on function public.claim_question(uuid, bigint, text, uuid)
  to authenticated, service_role;
