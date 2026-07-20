-- WF-03: atomic, scoped and idempotent trainer answer/transfer mutations.

alter table public.question_messages
  add column idempotency_key text;

alter table public.question_messages
  add constraint question_messages_answer_idempotency_required
    check (message_kind <> 'answer' or idempotency_key is not null),
  add constraint question_messages_idempotency_length
    check (idempotency_key is null or length(idempotency_key) between 16 and 200);

create unique index question_messages_question_idempotency_uidx
  on public.question_messages (question_id, idempotency_key)
  where idempotency_key is not null;

alter table public.question_transfers
  add constraint question_transfers_idempotency_length
    check (length(idempotency_key) between 16 and 200);

create or replace function public.answer_question(
  p_question_id uuid,
  p_expected_version bigint,
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
  question_row public.questions;
  answer_message public.question_messages;
  latest_transfer public.question_transfers;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_body), '') is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'answer body and idempotency key are required' using errcode = '22023';
  end if;

  select question_record.* into question_row
  from public.questions question_record
  where question_record.id = p_question_id
  for update;

  if question_row.id is null
     or not exists (
       select 1
       from public.cohorts cohort_record
       join public.cohort_memberships membership
         on membership.cohort_id = cohort_record.id
        and membership.user_id = actor_id
        and membership.role = 'trainer'
        and membership.state = 'active'
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
    raise exception 'question answer scope denied' using errcode = '42501';
  end if;

  select message_record.* into answer_message
  from public.question_messages message_record
  where message_record.question_id = question_row.id
    and message_record.idempotency_key = p_idempotency_key;
  if answer_message.id is not null then
    if answer_message.author_id <> actor_id
       or answer_message.message_kind <> 'answer' then
      raise exception 'question answer scope denied' using errcode = '42501';
    end if;
    if answer_message.body <> p_body then
      raise exception 'idempotency key was reused with a different answer payload'
        using errcode = '22023';
    end if;
    return question_row;
  end if;

  if question_row.assigned_trainer_id is distinct from actor_id then
    raise exception 'question is assigned to another trainer' using errcode = '42501';
  end if;

  select transfer_record.* into latest_transfer
  from public.question_transfers transfer_record
  where transfer_record.question_id = question_row.id
  order by transfer_record.created_at desc, transfer_record.id desc
  limit 1;
  if latest_transfer.id is not null
     and latest_transfer.to_trainer_id is distinct from actor_id then
    raise exception 'question ownership changed' using errcode = '42501';
  end if;

  if question_row.row_version <> p_expected_version
     or question_row.state not in ('assigned', 'transferred') then
    raise exception 'question is stale or not answerable' using errcode = '40001';
  end if;

  insert into public.question_messages (
    question_id, author_id, body, message_kind, idempotency_key
  ) values (
    question_row.id, actor_id, p_body, 'answer', p_idempotency_key
  ) returning * into answer_message;

  update public.questions question_record
  set state = 'answered',
      answered_at = statement_timestamp()
  where question_record.id = question_row.id
    and question_record.row_version = p_expected_version
    and question_record.assigned_trainer_id = actor_id
    and question_record.state in ('assigned', 'transferred')
  returning question_record.* into question_row;
  if question_row.id is null then
    raise exception 'question became stale' using errcode = '40001';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    question_row.organization_id, actor_id, 'trainer', 'question.answered', 'question',
    question_row.id, question_row.row_version, p_correlation_id,
    jsonb_build_object(
      'answer_message_id', answer_message.id,
      'cohort_id', question_row.cohort_id,
      'task_id', question_row.task_id
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    question_row.organization_id, 'question', question_row.id, question_row.row_version,
    'question.answered.v1', 1, p_correlation_id,
    jsonb_build_object(
      'question_id', question_row.id,
      'answer_message_id', answer_message.id,
      'learner_id', question_row.learner_id,
      'trainer_id', actor_id,
      'cohort_id', question_row.cohort_id,
      'task_id', question_row.task_id
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  ) values (
    question_row.organization_id,
    question_row.learner_id,
    'question.answered',
    'notifications.question_answered',
    jsonb_build_object(
      'question_id', question_row.id,
      'answer_message_id', answer_message.id,
      'cohort_id', question_row.cohort_id,
      'task_id', question_row.task_id
    ),
    'question-answer:' || answer_message.id::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return question_row;
end;
$$;

create or replace function public.transfer_question(
  p_question_id uuid,
  p_expected_version bigint,
  p_to_trainer_id uuid,
  p_reason text,
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
  transfer_row public.question_transfers;
  latest_transfer public.question_transfers;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_to_trainer_id is null
     or p_to_trainer_id = actor_id
     or nullif(btrim(p_reason), '') is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'a different target trainer, reason and idempotency key are required'
      using errcode = '22023';
  end if;

  select question_record.* into question_row
  from public.questions question_record
  where question_record.id = p_question_id
  for update;

  if question_row.id is null
     or not exists (
       select 1
       from public.cohorts cohort_record
       join public.cohort_memberships membership
         on membership.cohort_id = cohort_record.id
        and membership.user_id = actor_id
        and membership.role = 'trainer'
        and membership.state = 'active'
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
    raise exception 'question transfer scope denied' using errcode = '42501';
  end if;

  select transfer_record.* into transfer_row
  from public.question_transfers transfer_record
  where transfer_record.question_id = question_row.id
    and transfer_record.idempotency_key = p_idempotency_key;
  if transfer_row.id is not null then
    if transfer_row.from_trainer_id <> actor_id then
      raise exception 'question transfer scope denied' using errcode = '42501';
    end if;
    if transfer_row.to_trainer_id <> p_to_trainer_id
       or transfer_row.reason <> p_reason then
      raise exception 'idempotency key was reused with a different transfer payload'
        using errcode = '22023';
    end if;
    return question_row;
  end if;

  if question_row.assigned_trainer_id is distinct from actor_id then
    raise exception 'question is assigned to another trainer' using errcode = '42501';
  end if;

  select transfer_record.* into latest_transfer
  from public.question_transfers transfer_record
  where transfer_record.question_id = question_row.id
  order by transfer_record.created_at desc, transfer_record.id desc
  limit 1;
  if latest_transfer.id is not null
     and latest_transfer.to_trainer_id is distinct from actor_id then
    raise exception 'question ownership changed' using errcode = '42501';
  end if;

  if question_row.row_version <> p_expected_version
     or question_row.state not in ('assigned', 'transferred') then
    raise exception 'question is stale or not transferable' using errcode = '40001';
  end if;

  if not exists (
    select 1
    from public.cohort_memberships target_membership
    where target_membership.cohort_id = question_row.cohort_id
      and target_membership.user_id = p_to_trainer_id
      and target_membership.role = 'trainer'
      and target_membership.state = 'active'
      and exists (
        select 1
        from public.organization_memberships target_organization_membership
        where target_organization_membership.organization_id = question_row.organization_id
          and target_organization_membership.user_id = p_to_trainer_id
          and target_organization_membership.state = 'active'
          and (target_organization_membership.valid_until is null
            or target_organization_membership.valid_until > statement_timestamp())
      )
      and exists (
        select 1
        from public.user_roles assignment
        join public.roles role_record on role_record.id = assignment.role_id
        join public.role_permissions role_permission on role_permission.role_id = role_record.id
        join public.permissions permission_record on permission_record.id = role_permission.permission_id
        where assignment.user_id = p_to_trainer_id
          and permission_record.code = 'question.manage'
          and assignment.revoked_at is null
          and assignment.valid_from <= statement_timestamp()
          and (assignment.valid_until is null or assignment.valid_until > statement_timestamp())
          and (assignment.organization_id is null
            or assignment.organization_id = question_row.organization_id)
          and (assignment.cohort_id is null
            or assignment.cohort_id = question_row.cohort_id)
      )
  ) then
    raise exception 'target trainer is not active in the question cohort and tenant'
      using errcode = '23514';
  end if;

  update public.questions question_record
  set assigned_trainer_id = p_to_trainer_id,
      state = 'transferred'
  where question_record.id = question_row.id
    and question_record.row_version = p_expected_version
    and question_record.assigned_trainer_id = actor_id
    and question_record.state in ('assigned', 'transferred')
  returning question_record.* into question_row;
  if question_row.id is null then
    raise exception 'question became stale' using errcode = '40001';
  end if;

  insert into public.question_transfers (
    question_id, from_trainer_id, to_trainer_id, reason, idempotency_key
  ) values (
    question_row.id, actor_id, p_to_trainer_id, p_reason, p_idempotency_key
  ) returning * into transfer_row;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    question_row.organization_id, actor_id, 'trainer', 'question.transferred', 'question',
    question_row.id, question_row.row_version, p_correlation_id,
    jsonb_build_object(
      'transfer_id', transfer_row.id,
      'from_trainer_id', actor_id,
      'to_trainer_id', p_to_trainer_id,
      'cohort_id', question_row.cohort_id,
      'reason', p_reason
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    question_row.organization_id, 'question', question_row.id, question_row.row_version,
    'question.transferred.v1', 1, p_correlation_id,
    jsonb_build_object(
      'question_id', question_row.id,
      'transfer_id', transfer_row.id,
      'learner_id', question_row.learner_id,
      'from_trainer_id', actor_id,
      'to_trainer_id', p_to_trainer_id,
      'cohort_id', question_row.cohort_id,
      'task_id', question_row.task_id
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  ) values
    (
      question_row.organization_id,
      question_row.learner_id,
      'question.transferred',
      'notifications.question_transferred',
      jsonb_build_object(
        'question_id', question_row.id,
        'cohort_id', question_row.cohort_id,
        'task_id', question_row.task_id
      ),
      'question-transfer:' || transfer_row.id::text || ':learner'
    ),
    (
      question_row.organization_id,
      p_to_trainer_id,
      'question.assigned',
      'notifications.question_assigned',
      jsonb_build_object(
        'question_id', question_row.id,
        'transfer_id', transfer_row.id,
        'cohort_id', question_row.cohort_id,
        'task_id', question_row.task_id
      ),
      'question-transfer:' || transfer_row.id::text || ':trainer'
    )
  on conflict (recipient_id, deduplication_key) do nothing;

  return question_row;
end;
$$;

-- All writes flow through actor-derived security-definer functions. Direct
-- authenticated mutations would otherwise bypass CAS and side-effect rules.
revoke insert, update, delete on public.questions from authenticated;
revoke insert, update, delete on public.question_messages from authenticated;
revoke insert, update, delete on public.question_transfers from authenticated;

revoke all on function public.answer_question(uuid, bigint, text, text, uuid)
  from public, anon;
grant execute on function public.answer_question(uuid, bigint, text, text, uuid)
  to authenticated, service_role;

revoke all on function public.transfer_question(uuid, bigint, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.transfer_question(uuid, bigint, uuid, text, text, uuid)
  to authenticated, service_role;
