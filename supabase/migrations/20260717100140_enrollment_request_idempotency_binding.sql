-- Bind every enrollment request key to the exact canonical actor, tenant,
-- course and optional note. The receipt also covers successful requests that
-- return an already-live enrollment whose original row stores another key.

alter table public.enrollments
  add constraint enrollments_request_context_unique
  unique (id, organization_id, learner_id, course_id);

create table public.enrollment_request_receipts (
  id uuid primary key default app_private.uuid7(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  enrollment_id uuid not null,
  idempotency_key text not null check (
    length(idempotency_key) between 16 and 200
  ),
  request_note text,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz not null default statement_timestamp(),
  constraint enrollment_request_receipts_actor_key_unique
    unique (actor_id, idempotency_key),
  constraint enrollment_request_receipts_result_context_fk
    foreign key (enrollment_id, organization_id, actor_id, course_id)
    references public.enrollments (
      id, organization_id, learner_id, course_id
    ) on delete restrict
);

create index enrollment_request_receipts_enrollment_idx
  on public.enrollment_request_receipts (enrollment_id, created_at desc);
create index enrollment_request_receipts_context_idx
  on public.enrollment_request_receipts (
    actor_id, organization_id, course_id, created_at desc
  );

create trigger enrollment_request_receipts_immutable
before update or delete on public.enrollment_request_receipts
for each row execute function app_private.reject_mutation();

alter table public.enrollment_request_receipts enable row level security;
alter table public.enrollment_request_receipts force row level security;
revoke all on public.enrollment_request_receipts
  from public, anon, authenticated, service_role;

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
  v_actor_id uuid := (select auth.uid());
  normalized_request_note text := nullif(btrim(p_request_note), '');
  result public.enrollments;
  receipt_record public.enrollment_request_receipts;
  created_enrollment boolean := false;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;
  if not (select app_private.is_active_organization_member(
    p_organization_id
  )) then
    raise exception 'organization membership required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.courses course_record
    where course_record.id = p_course_id
      and course_record.state = 'active'
      and course_record.archived_at is null
      and (
        course_record.organization_id is null
        or course_record.organization_id = p_organization_id
      )
  ) then
    raise exception 'course is unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.entitlements entitlement_record
    where entitlement_record.organization_id = p_organization_id
      and (
        entitlement_record.user_id is null
        or entitlement_record.user_id = v_actor_id
      )
      and entitlement_record.capability in ('catalog', 'learning')
      and entitlement_record.valid_from <= statement_timestamp()
      and (
        entitlement_record.valid_until is null
        or entitlement_record.valid_until > statement_timestamp()
      )
  ) then
    raise exception 'learning entitlement required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'enrollment-request:' || v_actor_id::text || ':' || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.enrollment_request_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.organization_id <> p_organization_id
       or receipt_record.course_id <> p_course_id
       or receipt_record.request_note is distinct from
         normalized_request_note then
      raise exception 'enrollment idempotency conflict'
        using errcode = '23505';
    end if;

    select enrollment.* into result
    from public.enrollments enrollment
    where enrollment.id = receipt_record.enrollment_id
      and enrollment.organization_id = receipt_record.organization_id
      and enrollment.learner_id = receipt_record.actor_id
      and enrollment.course_id = receipt_record.course_id;
    if not found then
      raise exception 'enrollment request receipt is corrupt'
        using errcode = '55000';
    end if;
    return result;
  end if;

  -- Lazily bind rows created before the receipt ledger existed.
  select enrollment.* into result
  from public.enrollments enrollment
  where enrollment.learner_id = v_actor_id
    and enrollment.idempotency_key = p_idempotency_key;
  if result.id is not null then
    if result.organization_id <> p_organization_id
       or result.course_id <> p_course_id
       or nullif(btrim(result.request_note), '') is distinct from
         normalized_request_note then
      raise exception 'enrollment idempotency conflict'
        using errcode = '23505';
    end if;
  else
    select enrollment.* into result
    from public.enrollments enrollment
    where enrollment.learner_id = v_actor_id
      and enrollment.course_id = p_course_id
      and enrollment.state in ('requested', 'approved', 'assigned')
    order by enrollment.created_at desc
    limit 1;

    if result.id is not null
       and result.organization_id <> p_organization_id then
      raise exception 'enrollment context conflict'
        using errcode = '23505';
    end if;
  end if;

  if result.id is null then
    begin
      insert into public.enrollments (
        organization_id, learner_id, course_id, state, request_note,
        idempotency_key
      ) values (
        p_organization_id, v_actor_id, p_course_id, 'requested',
        normalized_request_note, p_idempotency_key
      ) returning * into result;
      created_enrollment := true;
    exception
      when unique_violation then
        -- A different session may have won either the actor/key or live-course
        -- uniqueness race. Re-read it and apply the same exact binding rules.
        select enrollment.* into result
        from public.enrollments enrollment
        where enrollment.learner_id = v_actor_id
          and enrollment.idempotency_key = p_idempotency_key;
        if result.id is not null then
          if result.organization_id <> p_organization_id
             or result.course_id <> p_course_id
             or nullif(btrim(result.request_note), '') is distinct from
               normalized_request_note then
            raise exception 'enrollment idempotency conflict'
              using errcode = '23505';
          end if;
        else
          select enrollment.* into result
          from public.enrollments enrollment
          where enrollment.learner_id = v_actor_id
            and enrollment.course_id = p_course_id
            and enrollment.state in ('requested', 'approved', 'assigned')
          order by enrollment.created_at desc
          limit 1;
          if result.id is null then
            raise;
          end if;
          if result.organization_id <> p_organization_id then
            raise exception 'enrollment context conflict'
              using errcode = '23505';
          end if;
        end if;
    end;
  end if;

  insert into public.enrollment_request_receipts (
    actor_id, organization_id, course_id, enrollment_id,
    idempotency_key, request_note
  ) values (
    v_actor_id, p_organization_id, p_course_id, result.id,
    p_idempotency_key, normalized_request_note
  ) returning * into receipt_record;

  if created_enrollment then
    insert into public.audit_events (
      organization_id, actor_id, actor_role, event_type, aggregate_type,
      aggregate_id, aggregate_version, correlation_id, metadata
    ) values (
      result.organization_id, v_actor_id, 'learner',
      'enrollment.requested', 'enrollment', result.id,
      result.row_version, app_private.uuid7(), '{}'::jsonb
    );
  end if;

  return result;
end;
$$;

alter function public.request_enrollment(uuid, uuid, text, text)
  owner to postgres;
revoke all on function public.request_enrollment(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_enrollment(uuid, uuid, text, text)
  to authenticated, service_role;
