-- BUG-078, BUG-080..BUG-090 and BUG-092: exact attempt delivery tuples,
-- serialized/payload-bound workflow commands, immutable evidence snapshots and
-- actor-derived historical attribution. Earlier migrations remain immutable.

-- Persist the complete delivery identity. A trigger below derives these
-- columns for frozen seeds and trusted imports that still use the older column
-- list; ambiguous tuples fail before a row can be created.
alter table public.attempts
  add column course_id uuid,
  add column content_version_id uuid;

alter table public.submissions
  add column enrollment_id uuid,
  add column course_id uuid,
  add column content_version_id uuid;

update public.attempts attempt_record
set course_id = enrollment_record.course_id,
    content_version_id = cohort_record.content_version_id
from public.enrollments enrollment_record
join public.cohorts cohort_record
  on cohort_record.id = enrollment_record.cohort_id
 and cohort_record.organization_id = enrollment_record.organization_id
 and cohort_record.course_id = enrollment_record.course_id
join public.tasks task_record
  on task_record.course_id = enrollment_record.course_id
 and task_record.content_version_id = cohort_record.content_version_id
where attempt_record.enrollment_id = enrollment_record.id
  and attempt_record.organization_id = enrollment_record.organization_id
  and attempt_record.learner_id = enrollment_record.learner_id
  and attempt_record.cohort_id = cohort_record.id
  and attempt_record.task_id = task_record.id;

update public.submissions submission_record
set enrollment_id = attempt_record.enrollment_id,
    course_id = attempt_record.course_id,
    content_version_id = attempt_record.content_version_id
from public.attempts attempt_record
where attempt_record.id = submission_record.attempt_id
  and attempt_record.organization_id = submission_record.organization_id
  and attempt_record.learner_id = submission_record.learner_id
  and attempt_record.cohort_id = submission_record.cohort_id
  and attempt_record.task_id = submission_record.task_id;

create function app_private.assert_attempt_history_preflight()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  invalid_count bigint;
begin
  select count(*) into invalid_count
  from public.attempts attempt_record
  left join public.enrollments enrollment_record
    on enrollment_record.id = attempt_record.enrollment_id
   and enrollment_record.organization_id = attempt_record.organization_id
   and enrollment_record.learner_id = attempt_record.learner_id
   and enrollment_record.cohort_id = attempt_record.cohort_id
   and enrollment_record.course_id = attempt_record.course_id
  left join public.cohorts cohort_record
    on cohort_record.id = attempt_record.cohort_id
   and cohort_record.organization_id = attempt_record.organization_id
   and cohort_record.course_id = attempt_record.course_id
   and cohort_record.content_version_id = attempt_record.content_version_id
  left join public.tasks task_record
    on task_record.id = attempt_record.task_id
   and task_record.course_id = attempt_record.course_id
   and task_record.content_version_id = attempt_record.content_version_id
  where enrollment_record.id is null
     or cohort_record.id is null
     or task_record.id is null
     or attempt_record.course_id is null
     or attempt_record.content_version_id is null;
  if invalid_count > 0 then
    raise exception 'preflight: % attempts have an ambiguous delivery tuple',
      invalid_count using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.submissions submission_record
  left join public.attempts attempt_record
    on attempt_record.id = submission_record.attempt_id
   and attempt_record.organization_id = submission_record.organization_id
   and attempt_record.enrollment_id = submission_record.enrollment_id
   and attempt_record.learner_id = submission_record.learner_id
   and attempt_record.cohort_id = submission_record.cohort_id
   and attempt_record.course_id = submission_record.course_id
   and attempt_record.content_version_id = submission_record.content_version_id
   and attempt_record.task_id = submission_record.task_id
  where attempt_record.id is null
     or submission_record.enrollment_id is null
     or submission_record.course_id is null
     or submission_record.content_version_id is null;
  if invalid_count > 0 then
    raise exception 'preflight: % submissions disagree with their exact attempt tuple',
      invalid_count using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.attempt_drafts draft_record
  join public.attempts attempt_record on attempt_record.id = draft_record.attempt_id
  where attempt_record.state not in ('in_progress', 'revision_required');
  if invalid_count > 0 then
    raise exception 'preflight: % terminal attempts still have mutable drafts',
      invalid_count using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.submission_versions version_record
  join public.submissions submission_record
    on submission_record.id = version_record.submission_id
  cross join lateral unnest(version_record.evidence_refs) evidence_id
  left join public.evidence evidence_record
    on evidence_record.id = evidence_id
   and evidence_record.organization_id = submission_record.organization_id
   and evidence_record.owner_id = submission_record.learner_id
   and evidence_record.task_id = submission_record.task_id
  where evidence_record.id is null;
  if invalid_count > 0 then
    raise exception 'preflight: % submission evidence references are not exact learner/task evidence',
      invalid_count using errcode = '23514';
  end if;

  select count(*) into invalid_count
  from public.submission_versions version_record
  where cardinality(version_record.evidence_refs) <>
    (
      select count(distinct evidence_id)
      from unnest(version_record.evidence_refs) evidence_id
    );
  if invalid_count > 0 then
    raise exception 'preflight: % submission versions contain duplicate evidence references',
      invalid_count using errcode = '23514';
  end if;
end;
$$;

alter function app_private.assert_attempt_history_preflight() owner to postgres;
revoke all on function app_private.assert_attempt_history_preflight()
  from public, anon, authenticated, service_role;

do $migration$
begin
  perform app_private.assert_attempt_history_preflight();
end
$migration$;

alter table public.attempts
  alter column course_id set not null,
  alter column content_version_id set not null;

alter table public.submissions
  alter column enrollment_id set not null,
  alter column course_id set not null,
  alter column content_version_id set not null;

alter table public.enrollments
  add constraint enrollments_exact_delivery_unique
  unique (id, organization_id, learner_id, cohort_id, course_id);

alter table public.cohorts
  add constraint cohorts_exact_publication_unique
  unique (id, organization_id, course_id, content_version_id);

alter table public.tasks
  add constraint tasks_exact_publication_unique
  unique (id, course_id, content_version_id);

alter table public.attempts
  add constraint attempts_exact_delivery_unique
  unique (
    id, organization_id, enrollment_id, learner_id, cohort_id, course_id,
    content_version_id, task_id
  ),
  add constraint attempts_enrollment_context_fk
  foreign key (enrollment_id, organization_id, learner_id, cohort_id, course_id)
  references public.enrollments (
    id, organization_id, learner_id, cohort_id, course_id
  ) on delete restrict not valid,
  add constraint attempts_cohort_publication_fk
  foreign key (cohort_id, organization_id, course_id, content_version_id)
  references public.cohorts (
    id, organization_id, course_id, content_version_id
  ) on delete restrict not valid,
  add constraint attempts_task_publication_fk
  foreign key (task_id, course_id, content_version_id)
  references public.tasks (id, course_id, content_version_id)
  on delete restrict not valid;

alter table public.submissions
  add constraint submissions_exact_delivery_unique
  unique (
    id, organization_id, enrollment_id, learner_id, cohort_id, course_id,
    content_version_id, task_id
  ),
  add constraint submissions_attempt_context_fk
  foreign key (
    attempt_id, organization_id, enrollment_id, learner_id, cohort_id,
    course_id, content_version_id, task_id
  ) references public.attempts (
    id, organization_id, enrollment_id, learner_id, cohort_id, course_id,
    content_version_id, task_id
  ) on delete restrict not valid;

alter table public.attempts
  validate constraint attempts_enrollment_context_fk;
alter table public.attempts
  validate constraint attempts_cohort_publication_fk;
alter table public.attempts
  validate constraint attempts_task_publication_fk;
alter table public.submissions
  validate constraint submissions_attempt_context_fk;

create index attempts_context_state_idx
  on public.attempts (
    enrollment_id, content_version_id, task_id, state, sequence_number desc
  );
create index submissions_context_state_idx
  on public.submissions (
    enrollment_id, content_version_id, task_id, state, updated_at desc
  );
create index submissions_attempt_exact_context_idx
  on public.submissions (
    attempt_id, organization_id, enrollment_id, learner_id, cohort_id,
    course_id, content_version_id, task_id
  );

create function app_private.derive_attempt_delivery_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  derived_record record;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.enrollment_id is distinct from old.enrollment_id
       or new.learner_id is distinct from old.learner_id
       or new.cohort_id is distinct from old.cohort_id
       or new.course_id is distinct from old.course_id
       or new.content_version_id is distinct from old.content_version_id
       or new.task_id is distinct from old.task_id then
      raise exception 'attempt delivery identity is immutable'
        using errcode = '55000';
    end if;
    return new;
  end if;

  select
    enrollment_record.organization_id,
    enrollment_record.learner_id,
    enrollment_record.cohort_id,
    enrollment_record.course_id,
    cohort_record.content_version_id
  into derived_record
  from public.enrollments enrollment_record
  join public.cohorts cohort_record
    on cohort_record.id = enrollment_record.cohort_id
   and cohort_record.organization_id = enrollment_record.organization_id
   and cohort_record.course_id = enrollment_record.course_id
  join public.tasks task_record
    on task_record.id = new.task_id
   and task_record.course_id = enrollment_record.course_id
   and task_record.content_version_id = cohort_record.content_version_id
  where enrollment_record.id = new.enrollment_id;

  if not found
     or (new.organization_id is not null and
       new.organization_id <> derived_record.organization_id)
     or (new.learner_id is not null and
       new.learner_id <> derived_record.learner_id)
     or (new.cohort_id is not null and
       new.cohort_id <> derived_record.cohort_id)
     or (new.course_id is not null and
       new.course_id <> derived_record.course_id)
     or (new.content_version_id is not null and
       new.content_version_id <> derived_record.content_version_id) then
    raise exception 'attempt delivery context is invalid'
      using errcode = '23514';
  end if;

  new.organization_id := derived_record.organization_id;
  new.learner_id := derived_record.learner_id;
  new.cohort_id := derived_record.cohort_id;
  new.course_id := derived_record.course_id;
  new.content_version_id := derived_record.content_version_id;
  return new;
end;
$$;

create function app_private.derive_submission_delivery_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  derived_record public.attempts;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.attempt_id is distinct from old.attempt_id
       or new.enrollment_id is distinct from old.enrollment_id
       or new.learner_id is distinct from old.learner_id
       or new.cohort_id is distinct from old.cohort_id
       or new.course_id is distinct from old.course_id
       or new.content_version_id is distinct from old.content_version_id
       or new.task_id is distinct from old.task_id then
      raise exception 'submission delivery identity is immutable'
        using errcode = '55000';
    end if;
    return new;
  end if;

  select attempt_record.* into derived_record
  from public.attempts attempt_record
  where attempt_record.id = new.attempt_id;
  if not found
     or (new.organization_id is not null and
       new.organization_id <> derived_record.organization_id)
     or (new.enrollment_id is not null and
       new.enrollment_id <> derived_record.enrollment_id)
     or (new.learner_id is not null and
       new.learner_id <> derived_record.learner_id)
     or (new.cohort_id is not null and
       new.cohort_id <> derived_record.cohort_id)
     or (new.course_id is not null and
       new.course_id <> derived_record.course_id)
     or (new.content_version_id is not null and
       new.content_version_id <> derived_record.content_version_id)
     or (new.task_id is not null and
       new.task_id <> derived_record.task_id) then
    raise exception 'submission delivery context is invalid'
      using errcode = '23514';
  end if;

  new.organization_id := derived_record.organization_id;
  new.enrollment_id := derived_record.enrollment_id;
  new.learner_id := derived_record.learner_id;
  new.cohort_id := derived_record.cohort_id;
  new.course_id := derived_record.course_id;
  new.content_version_id := derived_record.content_version_id;
  new.task_id := derived_record.task_id;
  return new;
end;
$$;

alter function app_private.derive_attempt_delivery_context() owner to postgres;
alter function app_private.derive_submission_delivery_context() owner to postgres;
revoke all on function app_private.derive_attempt_delivery_context()
  from public, anon, authenticated, service_role;
revoke all on function app_private.derive_submission_delivery_context()
  from public, anon, authenticated, service_role;

create trigger attempts_derive_delivery_context
before insert or update of
  organization_id, enrollment_id, learner_id, cohort_id, course_id,
  content_version_id, task_id
on public.attempts
for each row execute function app_private.derive_attempt_delivery_context();

create trigger submissions_derive_delivery_context
before insert or update of
  organization_id, attempt_id, enrollment_id, learner_id, cohort_id,
  course_id, content_version_id, task_id
on public.submissions
for each row execute function app_private.derive_submission_delivery_context();

-- Append-only normalized evidence and hint snapshots preserve the exact facts
-- visible at each immutable submission version.
alter table public.submission_versions
  add constraint submission_versions_id_submission_unique
  unique (id, submission_id);

alter table public.submissions
  add constraint submissions_id_owner_task_unique
  unique (id, organization_id, learner_id, task_id);

alter table public.evidence
  add constraint evidence_exact_owner_task_unique
  unique (id, organization_id, owner_id, task_id);

create table public.submission_version_evidence (
  submission_version_id uuid not null,
  submission_id uuid not null,
  evidence_id uuid not null,
  organization_id uuid not null,
  learner_id uuid not null,
  task_id uuid not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default statement_timestamp(),
  primary key (submission_version_id, evidence_id),
  constraint submission_version_evidence_position_unique
    unique (submission_version_id, position),
  constraint submission_version_evidence_version_fk
    foreign key (submission_version_id, submission_id)
    references public.submission_versions (id, submission_id)
    on delete restrict,
  constraint submission_version_evidence_submission_fk
    foreign key (
      submission_id, organization_id, learner_id, task_id
    ) references public.submissions (
      id, organization_id, learner_id, task_id
    ) on delete restrict,
  constraint submission_version_evidence_evidence_fk
    foreign key (evidence_id, organization_id, learner_id, task_id)
    references public.evidence (id, organization_id, owner_id, task_id)
    on delete restrict
);

create index submission_version_evidence_submission_idx
  on public.submission_version_evidence (submission_id, submission_version_id);
create index submission_version_evidence_evidence_idx
  on public.submission_version_evidence (evidence_id, submission_version_id);
create index submission_version_evidence_submission_context_idx
  on public.submission_version_evidence (
    submission_id, organization_id, learner_id, task_id
  );
create index submission_version_evidence_evidence_context_idx
  on public.submission_version_evidence (
    evidence_id, organization_id, learner_id, task_id
  );

alter table public.task_hints
  add constraint task_hints_id_task_unique unique (id, task_id);

create table public.submission_version_hint_usage (
  submission_version_id uuid not null,
  submission_id uuid not null,
  attempt_id uuid not null,
  task_id uuid not null,
  hint_id uuid not null,
  first_used_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (submission_version_id, hint_id),
  constraint submission_version_hint_usage_version_fk
    foreign key (submission_version_id, submission_id)
    references public.submission_versions (id, submission_id)
    on delete restrict,
  constraint submission_version_hint_usage_attempt_fk
    foreign key (attempt_id) references public.attempts(id) on delete restrict,
  constraint submission_version_hint_usage_hint_fk
    foreign key (hint_id, task_id)
    references public.task_hints(id, task_id) on delete restrict
);

create index submission_version_hint_usage_attempt_idx
  on public.submission_version_hint_usage (attempt_id, first_used_at);
create index submission_version_hint_usage_version_context_idx
  on public.submission_version_hint_usage (
    submission_version_id, submission_id
  );
create index submission_version_hint_usage_hint_context_idx
  on public.submission_version_hint_usage (hint_id, task_id);

insert into public.submission_version_evidence (
  submission_version_id, submission_id, evidence_id, organization_id,
  learner_id, task_id, position
)
select
  version_record.id,
  submission_record.id,
  evidence_id,
  submission_record.organization_id,
  submission_record.learner_id,
  submission_record.task_id,
  evidence_ref.ordinality - 1
from public.submission_versions version_record
join public.submissions submission_record
  on submission_record.id = version_record.submission_id
cross join lateral unnest(version_record.evidence_refs)
  with ordinality evidence_ref(evidence_id, ordinality);

insert into public.submission_version_hint_usage (
  submission_version_id, submission_id, attempt_id, task_id, hint_id,
  first_used_at
)
select
  version_record.id,
  submission_record.id,
  submission_record.attempt_id,
  submission_record.task_id,
  usage_record.hint_id,
  usage_record.first_used_at
from public.submission_versions version_record
join public.submissions submission_record
  on submission_record.id = version_record.submission_id
join public.attempt_hint_usage usage_record
  on usage_record.attempt_id = submission_record.attempt_id
 and usage_record.first_used_at <= version_record.submitted_at;

create trigger submission_version_evidence_immutable
before update or delete on public.submission_version_evidence
for each row execute function app_private.reject_mutation();

create trigger submission_version_hint_usage_immutable
before update or delete on public.submission_version_hint_usage
for each row execute function app_private.reject_mutation();

create trigger evidence_provenance_immutable
before update or delete on public.evidence
for each row execute function app_private.reject_mutation();

alter table public.submission_version_evidence enable row level security;
alter table public.submission_version_evidence force row level security;
alter table public.submission_version_hint_usage enable row level security;
alter table public.submission_version_hint_usage force row level security;

revoke all on public.submission_version_evidence
  from public, anon, authenticated, service_role;
revoke all on public.submission_version_hint_usage
  from public, anon, authenticated, service_role;
grant select on public.submission_version_evidence to authenticated;
grant select on public.submission_version_hint_usage to authenticated;

create policy submission_version_evidence_scoped_read
on public.submission_version_evidence for select to authenticated
using ((select app_private.can_access_submission(submission_id)));

create policy submission_version_hint_usage_scoped_read
on public.submission_version_hint_usage for select to authenticated
using ((select app_private.can_access_submission(submission_id)));

-- A mutable draft can exist only while its aggregate is editable. Submit
-- changes the attempt state first and then deletes the draft in the same
-- transaction, so insert/update races fail after the aggregate lock releases.
create function app_private.guard_editable_attempt_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.attempts attempt_record
    where attempt_record.id = new.attempt_id
      and attempt_record.state in ('in_progress', 'revision_required')
  ) then
    raise exception 'draft requires an editable attempt'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

alter function app_private.guard_editable_attempt_draft() owner to postgres;
revoke all on function app_private.guard_editable_attempt_draft()
  from public, anon, authenticated, service_role;

create trigger attempt_drafts_require_editable_attempt
before insert or update on public.attempt_drafts
for each row execute function app_private.guard_editable_attempt_draft();

-- Retry receipts are private, append-only and bound to the actor, operation,
-- exact delivery tuple, expected version and canonical payload fingerprint.
create table public.attempt_command_receipts (
  id uuid primary key default app_private.uuid7(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (
    operation in (
      'start_attempt', 'submit_attempt', 'create_external_task_evidence'
    )
  ),
  organization_id uuid not null,
  enrollment_id uuid not null,
  cohort_id uuid not null,
  course_id uuid not null,
  content_version_id uuid not null,
  task_id uuid not null,
  attempt_id uuid not null,
  submission_id uuid references public.submissions(id) on delete restrict,
  submission_version_id uuid references public.submission_versions(id)
    on delete restrict,
  evidence_id uuid references public.evidence(id) on delete restrict,
  expected_attempt_row_version bigint,
  idempotency_key text not null check (
    length(idempotency_key) between 16 and 200
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz not null default statement_timestamp(),
  constraint attempt_command_receipts_actor_operation_key_unique
    unique (actor_id, operation, idempotency_key),
  constraint attempt_command_receipts_attempt_fk
    foreign key (
      attempt_id, organization_id, enrollment_id, actor_id, cohort_id,
      course_id, content_version_id, task_id
    ) references public.attempts (
      id, organization_id, enrollment_id, learner_id, cohort_id, course_id,
      content_version_id, task_id
    ) on delete restrict,
  constraint attempt_command_receipts_result_consistency check (
    (
      operation = 'start_attempt'
      and submission_id is null
      and submission_version_id is null
      and evidence_id is null
      and expected_attempt_row_version is null
    )
    or (
      operation = 'submit_attempt'
      and submission_id is not null
      and submission_version_id is not null
      and evidence_id is null
      and expected_attempt_row_version is not null
    )
    or (
      operation = 'create_external_task_evidence'
      and submission_id is null
      and submission_version_id is null
      and evidence_id is not null
      and expected_attempt_row_version is not null
    )
  )
);

create index attempt_command_receipts_attempt_idx
  on public.attempt_command_receipts (attempt_id, operation, created_at desc);
create index attempt_command_receipts_submission_idx
  on public.attempt_command_receipts (submission_id, created_at desc)
  where submission_id is not null;
create index attempt_command_receipts_evidence_idx
  on public.attempt_command_receipts (evidence_id, created_at desc)
  where evidence_id is not null;
create index attempt_command_receipts_attempt_context_idx
  on public.attempt_command_receipts (
    attempt_id, organization_id, enrollment_id, actor_id, cohort_id,
    course_id, content_version_id, task_id
  );
create index attempt_command_receipts_submission_version_idx
  on public.attempt_command_receipts (submission_version_id)
  where submission_version_id is not null;

create trigger attempt_command_receipts_immutable
before update or delete on public.attempt_command_receipts
for each row execute function app_private.reject_mutation();

alter table public.attempt_command_receipts enable row level security;
alter table public.attempt_command_receipts force row level security;
revoke all on public.attempt_command_receipts
  from public, anon, authenticated, service_role;

create function app_private.attempt_command_payload_hash(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(
      pg_catalog.convert_to(p_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

alter function app_private.attempt_command_payload_hash(jsonb)
  owner to postgres;
revoke all on function app_private.attempt_command_payload_hash(jsonb)
  from public, anon, authenticated, service_role;

-- Active workflow mutations use this exact constrained context. History has a
-- separate boundary below and deliberately does not make terminal cohorts an
-- active learner workspace.
create function app_private.current_actor_exact_attempt_context(
  p_attempt_id uuid
)
returns table (
  attempt_id uuid,
  organization_id uuid,
  enrollment_id uuid,
  learner_id uuid,
  cohort_id uuid,
  course_id uuid,
  content_version_id uuid,
  task_id uuid,
  attempt_state public.attempt_state,
  attempt_row_version bigint,
  progression_mode text,
  content_snapshot jsonb,
  task_payload jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    attempt_record.id,
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    attempt_record.learner_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.state,
    attempt_record.row_version,
    cohort_record.progression_mode,
    version_record.snapshot,
    app_private.snapshot_task_payload(
      version_record.snapshot, attempt_record.task_id
    )
  from public.attempts attempt_record
  join public.enrollments enrollment_record
    on enrollment_record.id = attempt_record.enrollment_id
   and enrollment_record.organization_id = attempt_record.organization_id
   and enrollment_record.learner_id = attempt_record.learner_id
   and enrollment_record.cohort_id = attempt_record.cohort_id
   and enrollment_record.course_id = attempt_record.course_id
   and enrollment_record.state = 'assigned'
  join public.cohorts cohort_record
    on cohort_record.id = attempt_record.cohort_id
   and cohort_record.organization_id = attempt_record.organization_id
   and cohort_record.course_id = attempt_record.course_id
   and cohort_record.content_version_id = attempt_record.content_version_id
   and cohort_record.state = 'active'
  join public.tasks task_record
    on task_record.id = attempt_record.task_id
   and task_record.course_id = attempt_record.course_id
   and task_record.content_version_id = attempt_record.content_version_id
  join public.content_versions version_record
    on version_record.id = attempt_record.content_version_id
   and version_record.course_id = attempt_record.course_id
   and version_record.state in ('published', 'archived')
  join public.courses course_record
    on course_record.id = attempt_record.course_id
   and (
     course_record.organization_id is null
     or course_record.organization_id = attempt_record.organization_id
   )
  where attempt_record.id = p_attempt_id
    and attempt_record.learner_id = (select auth.uid())
    and app_private.current_actor_is_active_learner(
      attempt_record.organization_id, attempt_record.cohort_id
    )
    and app_private.is_valid_learner_content_snapshot(
      version_record.snapshot,
      course_record.id,
      course_record.slug,
      version_record.id,
      version_record.version_number
    )
    and app_private.snapshot_task_payload(
      version_record.snapshot, attempt_record.task_id
    ) is not null;
$$;

alter function app_private.current_actor_exact_attempt_context(uuid)
  owner to postgres;
revoke all on function app_private.current_actor_exact_attempt_context(uuid)
  from public, anon, authenticated, service_role;
-- The exact boolean existence checks in attempt RLS execute this helper as
-- the caller. Its returned snapshot remains protected by the function's own
-- actor-derived joins, while anon is intentionally excluded.
grant execute on function app_private.current_actor_exact_attempt_context(uuid)
  to authenticated, service_role;

-- Historical learner scope is intentionally independent of current cohort
-- workspace state, but still requires one active tenant membership and an
-- unrevoked learner assignment whose role carries cohort.read.
create function app_private.current_actor_has_learner_history_scope(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles profile_record
      where profile_record.user_id = (select auth.uid())
        and profile_record.state = 'active'
        and profile_record.deactivated_at is null
    )
    and exists (
      select 1
      from public.organizations organization_record
      join public.organization_memberships membership_record
        on membership_record.organization_id = organization_record.id
       and membership_record.user_id = (select auth.uid())
       and membership_record.state = 'active'
       and membership_record.removed_at is null
       and (
         membership_record.valid_until is null
         or membership_record.valid_until > statement_timestamp()
       )
      where organization_record.id = p_organization_id
        and organization_record.state = 'active'
        and organization_record.archived_at is null
    )
    and exists (
      select 1
      from public.user_roles assignment_record
      join public.roles role_record
        on role_record.id = assignment_record.role_id
       and role_record.code = 'learner'
      join public.role_permissions role_permission
        on role_permission.role_id = role_record.id
      join public.permissions permission_record
        on permission_record.id = role_permission.permission_id
       and permission_record.code = 'cohort.read'
      where assignment_record.user_id = (select auth.uid())
        and assignment_record.organization_id = p_organization_id
        and assignment_record.revoked_at is null
        and assignment_record.valid_from <= statement_timestamp()
        and (
          assignment_record.valid_until is null
          or assignment_record.valid_until > statement_timestamp()
        )
    );
$$;

alter function app_private.current_actor_has_learner_history_scope(uuid)
  owner to postgres;
revoke all on function app_private.current_actor_has_learner_history_scope(uuid)
  from public, anon, authenticated, service_role;

-- Replace broad row policies. Learners read only their currently authorized
-- exact aggregate; trainers never receive unsent drafts and see telemetry only
-- once an immutable submission exists.
drop policy if exists attempts_scoped on public.attempts;
create policy attempts_exact_read
on public.attempts for select to authenticated
using (
  (
    learner_id = (select auth.uid())
    and exists (
      select 1
      from app_private.current_actor_exact_attempt_context(attempts.id)
    )
  )
  or exists (
    select 1
    from public.submissions submission_record
    where submission_record.attempt_id = attempts.id
      and (select app_private.can_access_submission(submission_record.id))
  )
);

drop policy if exists attempt_drafts_scoped on public.attempt_drafts;
create policy attempt_drafts_owner_read
on public.attempt_drafts for select to authenticated
using (exists (
  select 1
  from public.attempts attempt_record
  where attempt_record.id = attempt_drafts.attempt_id
    and attempt_record.learner_id = (select auth.uid())
    and attempt_record.state in ('in_progress', 'revision_required')
    and exists (
      select 1
      from app_private.current_actor_exact_attempt_context(attempt_record.id)
    )
));

drop policy if exists attempt_hint_usage_scoped_read
  on public.attempt_hint_usage;
create policy attempt_hint_usage_exact_read
on public.attempt_hint_usage for select to authenticated
using (exists (
  select 1
  from public.attempts attempt_record
  where attempt_record.id = attempt_hint_usage.attempt_id
    and (
      (
        attempt_record.learner_id = (select auth.uid())
        and exists (
          select 1
          from app_private.current_actor_exact_attempt_context(
            attempt_record.id
          )
        )
      )
      or exists (
        select 1
        from public.submissions submission_record
        where submission_record.attempt_id = attempt_record.id
          and (select app_private.can_access_submission(
            submission_record.id
          ))
      )
    )
));

create or replace function app_private.can_access_evidence(p_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.evidence evidence_record
    where evidence_record.id = p_evidence_id
      and (
        (
          evidence_record.owner_id = (select auth.uid())
          and app_private.current_actor_has_learner_history_scope(
            evidence_record.organization_id
          )
        )
        or exists (
          select 1
          from public.submission_version_evidence link_record
          where link_record.evidence_id = evidence_record.id
            and app_private.can_access_submission(
              link_record.submission_id
            )
        )
        or (
          evidence_record.submission_version_id is not null
          and exists (
            select 1
            from public.submission_versions version_record
            where version_record.id = evidence_record.submission_version_id
              and app_private.can_access_submission(
                version_record.submission_id
              )
          )
        )
        or app_private.has_permission(
          'organization.manage', evidence_record.organization_id, null
        )
      )
  );
$$;

alter function app_private.can_access_evidence(uuid) owner to postgres;
revoke all on function app_private.can_access_evidence(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.can_access_evidence(uuid)
  to authenticated, service_role;

revoke insert, update, delete on public.attempts from authenticated;
revoke insert, update, delete on public.attempt_drafts from authenticated;
revoke insert, update, delete on public.attempt_hint_usage from authenticated;
revoke insert, update, delete on public.submission_versions from authenticated;
revoke insert, update, delete on public.submission_answers from authenticated;
revoke insert, update, delete on public.evidence from authenticated;

-- Preferred exact-context start contract. Authorization is evaluated before a
-- completed receipt is disclosed, and receipt/context locks make concurrent
-- retries converge without selecting another delivery by recency.
create or replace function public.start_attempt(
  p_enrollment_id uuid,
  p_task_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns table (
  attempt_id uuid,
  organization_id uuid,
  enrollment_id uuid,
  cohort_id uuid,
  course_id uuid,
  content_version_id uuid,
  task_id uuid,
  attempt_state public.attempt_state,
  attempt_row_version bigint,
  replayed boolean,
  correlation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  context_record record;
  task_payload jsonb;
  payload_hash text;
  receipt_record public.attempt_command_receipts;
  attempt_record public.attempts;
  next_sequence integer;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_enrollment_id is null
     or p_task_id is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'invalid attempt start command' using errcode = '22023';
  end if;

  select
    enrollment_record.organization_id,
    enrollment_record.id as enrollment_id,
    cohort_record.id as cohort_id,
    enrollment_record.course_id,
    cohort_record.content_version_id,
    cohort_record.progression_mode,
    version_record.snapshot,
    course_record.slug,
    version_record.version_number
  into context_record
  from public.enrollments enrollment_record
  join public.cohorts cohort_record
    on cohort_record.id = enrollment_record.cohort_id
   and cohort_record.organization_id = enrollment_record.organization_id
   and cohort_record.course_id = enrollment_record.course_id
   and cohort_record.state = 'active'
  join public.content_versions version_record
    on version_record.id = cohort_record.content_version_id
   and version_record.course_id = enrollment_record.course_id
   and version_record.state in ('published', 'archived')
  join public.courses course_record
    on course_record.id = enrollment_record.course_id
   and (
     course_record.organization_id is null
     or course_record.organization_id = enrollment_record.organization_id
   )
  join public.tasks normalized_task
    on normalized_task.id = p_task_id
   and normalized_task.course_id = enrollment_record.course_id
   and normalized_task.content_version_id = cohort_record.content_version_id
  where enrollment_record.id = p_enrollment_id
    and enrollment_record.learner_id = v_actor_id
    and enrollment_record.state = 'assigned'
    and app_private.current_actor_is_active_learner(
      enrollment_record.organization_id, cohort_record.id
    )
    and app_private.is_valid_learner_content_snapshot(
      version_record.snapshot,
      course_record.id,
      course_record.slug,
      version_record.id,
      version_record.version_number
    );
  if not found then
    raise exception 'attempt start scope denied' using errcode = '42501';
  end if;

  task_payload := app_private.snapshot_task_payload(
    context_record.snapshot, p_task_id
  );
  if task_payload is null
     or app_private.learner_snapshot_task_lock_reasons(
       context_record.enrollment_id,
       context_record.organization_id,
       context_record.cohort_id,
       context_record.progression_mode,
       context_record.content_version_id,
       context_record.snapshot,
       task_payload
     ) <> '[]'::jsonb then
    raise exception 'attempt start scope denied' using errcode = '42501';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'start_attempt',
      'actor_id', v_actor_id,
      'organization_id', context_record.organization_id,
      'enrollment_id', context_record.enrollment_id,
      'cohort_id', context_record.cohort_id,
      'course_id', context_record.course_id,
      'content_version_id', context_record.content_version_id,
      'task_id', p_task_id
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'attempt-receipt:' || v_actor_id::text || ':start_attempt:'
        || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.attempt_command_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.operation = 'start_attempt'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.organization_id <> context_record.organization_id
       or receipt_record.enrollment_id <> context_record.enrollment_id
       or receipt_record.cohort_id <> context_record.cohort_id
       or receipt_record.course_id <> context_record.course_id
       or receipt_record.content_version_id <>
         context_record.content_version_id
       or receipt_record.task_id <> p_task_id
       or receipt_record.payload_hash <> payload_hash then
      raise exception 'attempt start idempotency conflict'
        using errcode = '23505';
    end if;

    select attempt.* into attempt_record
    from public.attempts attempt
    where attempt.id = receipt_record.attempt_id
      and attempt.organization_id = context_record.organization_id
      and attempt.enrollment_id = context_record.enrollment_id
      and attempt.learner_id = v_actor_id
      and attempt.cohort_id = context_record.cohort_id
      and attempt.course_id = context_record.course_id
      and attempt.content_version_id = context_record.content_version_id
      and attempt.task_id = p_task_id;
    if not found then
      raise exception 'attempt start receipt is corrupt' using errcode = '55000';
    end if;

    return query select
      attempt_record.id,
      attempt_record.organization_id,
      attempt_record.enrollment_id,
      attempt_record.cohort_id,
      attempt_record.course_id,
      attempt_record.content_version_id,
      attempt_record.task_id,
      attempt_record.state,
      attempt_record.row_version,
      true,
      receipt_record.correlation_id;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'attempt-context:' || context_record.enrollment_id::text || ':'
        || p_task_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.attempts terminal_attempt
    where terminal_attempt.enrollment_id = context_record.enrollment_id
      and terminal_attempt.task_id = p_task_id
      and terminal_attempt.state in ('accepted', 'abandoned')
  ) then
    raise exception 'attempt restart is not available'
      using errcode = '55000';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.enrollment_id = context_record.enrollment_id
    and attempt.learner_id = v_actor_id
    and attempt.cohort_id = context_record.cohort_id
    and attempt.content_version_id = context_record.content_version_id
    and attempt.task_id = p_task_id
    and attempt.state in (
      'in_progress', 'submitted', 'revision_required', 'resubmitted'
    )
  order by attempt.sequence_number desc, attempt.id desc
  limit 1
  for update;

  if attempt_record.id is null then
    select coalesce(max(attempt.sequence_number), 0) + 1
    into next_sequence
    from public.attempts attempt
    where attempt.enrollment_id = context_record.enrollment_id
      and attempt.task_id = p_task_id;

    insert into public.attempts (
      organization_id, enrollment_id, learner_id, cohort_id, course_id,
      content_version_id, task_id, sequence_number, state,
      start_idempotency_key
    ) values (
      context_record.organization_id,
      context_record.enrollment_id,
      v_actor_id,
      context_record.cohort_id,
      context_record.course_id,
      context_record.content_version_id,
      p_task_id,
      next_sequence,
      'in_progress',
      p_idempotency_key
    ) returning * into attempt_record;

    insert into public.audit_events (
      organization_id, actor_id, actor_role, event_type, aggregate_type,
      aggregate_id, aggregate_version, correlation_id, metadata
    ) values (
      attempt_record.organization_id,
      v_actor_id,
      'learner',
      'attempt.started',
      'attempt',
      attempt_record.id,
      attempt_record.row_version,
      p_correlation_id,
      jsonb_build_object(
        'enrollment_id', attempt_record.enrollment_id,
        'cohort_id', attempt_record.cohort_id,
        'course_id', attempt_record.course_id,
        'content_version_id', attempt_record.content_version_id,
        'task_id', attempt_record.task_id
      )
    );
  end if;

  insert into public.attempt_command_receipts (
    actor_id, operation, organization_id, enrollment_id, cohort_id,
    course_id, content_version_id, task_id, attempt_id, idempotency_key,
    payload_hash, correlation_id
  ) values (
    v_actor_id,
    'start_attempt',
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.id,
    p_idempotency_key,
    payload_hash,
    p_correlation_id
  ) returning * into receipt_record;

  return query select
    attempt_record.id,
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.state,
    attempt_record.row_version,
    false,
    receipt_record.correlation_id;
end;
$$;

alter function public.start_attempt(uuid, uuid, text, uuid)
  owner to postgres;
revoke all on function public.start_attempt(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_attempt(uuid, uuid, text, uuid)
  to authenticated, service_role;

-- Compatibility for the current task-only application action. A first call
-- proceeds only when exactly one eligible delivery exists; a known exact
-- receipt can be replayed after the same fresh authorization.
create or replace function public.start_attempt(
  p_task_id uuid,
  p_idempotency_key text
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  receipt_record public.attempt_command_receipts;
  selected_enrollment_id uuid;
  eligible_count bigint;
  started_attempt_id uuid;
  result public.attempts;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_task_id is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200 then
    raise exception 'invalid attempt start command' using errcode = '22023';
  end if;

  select receipt.* into receipt_record
  from public.attempt_command_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.operation = 'start_attempt'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.task_id <> p_task_id then
      raise exception 'attempt start idempotency conflict'
        using errcode = '23505';
    end if;
    selected_enrollment_id := receipt_record.enrollment_id;
  else
    with eligible_contexts as (
      select enrollment_record.id
      from public.enrollments enrollment_record
      join public.cohorts cohort_record
        on cohort_record.id = enrollment_record.cohort_id
       and cohort_record.organization_id = enrollment_record.organization_id
       and cohort_record.course_id = enrollment_record.course_id
       and cohort_record.state = 'active'
      join public.content_versions version_record
        on version_record.id = cohort_record.content_version_id
       and version_record.course_id = enrollment_record.course_id
       and version_record.state in ('published', 'archived')
      join public.courses course_record
        on course_record.id = enrollment_record.course_id
       and (
         course_record.organization_id is null
         or course_record.organization_id = enrollment_record.organization_id
       )
      join public.tasks task_record
        on task_record.id = p_task_id
       and task_record.course_id = enrollment_record.course_id
       and task_record.content_version_id = cohort_record.content_version_id
      where enrollment_record.learner_id = v_actor_id
        and enrollment_record.state = 'assigned'
        and app_private.current_actor_is_active_learner(
          enrollment_record.organization_id, cohort_record.id
        )
        and app_private.is_valid_learner_content_snapshot(
          version_record.snapshot,
          course_record.id,
          course_record.slug,
          version_record.id,
          version_record.version_number
        )
        and app_private.learner_snapshot_task_lock_reasons(
          enrollment_record.id,
          enrollment_record.organization_id,
          cohort_record.id,
          cohort_record.progression_mode,
          version_record.id,
          version_record.snapshot,
          app_private.snapshot_task_payload(
            version_record.snapshot, p_task_id
          )
        ) = '[]'::jsonb
    )
    select
      (array_agg(eligible_context.id order by eligible_context.id))[1],
      count(*)
    into selected_enrollment_id, eligible_count
    from eligible_contexts eligible_context;

    if eligible_count <> 1 then
      -- Preserve the task-only application's established generic denial while
      -- the preferred overload carries the explicit enrollment identity.
      raise exception 'no active enrollment and available pinned task'
        using errcode = '42501';
    end if;
  end if;

  select exact_start.attempt_id into started_attempt_id
  from public.start_attempt(
    selected_enrollment_id,
    p_task_id,
    p_idempotency_key,
    coalesce(receipt_record.correlation_id, app_private.uuid7())
  ) exact_start;

  select attempt.* into result
  from public.attempts attempt
  where attempt.id = started_attempt_id;
  if not found then
    raise exception 'attempt start result is unavailable' using errcode = '55000';
  end if;
  return result;
end;
$$;

alter function public.start_attempt(uuid, text) owner to postgres;
revoke all on function public.start_attempt(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.start_attempt(uuid, text)
  to authenticated, service_role;

create or replace function public.save_attempt_draft(
  p_attempt_id uuid,
  p_expected_draft_version bigint,
  p_answer_text text,
  p_selected_option_ids uuid[],
  p_evidence_draft jsonb,
  p_elapsed_seconds integer,
  p_used_hint_ids uuid[]
)
returns table (
  attempt_id uuid,
  draft_version bigint,
  attempt_version bigint,
  elapsed_seconds integer,
  hint_used boolean,
  hint_first_used_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  attempt_record public.attempts;
  context_record record;
  draft_record public.attempt_drafts;
  refreshed_attempt public.attempts;
  distinct_selected_count bigint;
  distinct_hint_count bigint;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attempt_id is null
     or p_expected_draft_version is null
     or p_expected_draft_version < 0
     or p_answer_text is null
     or length(p_answer_text) > 50000
     or p_selected_option_ids is null
     or cardinality(p_selected_option_ids) > 100
     or p_evidence_draft is null
     or jsonb_typeof(p_evidence_draft) is distinct from 'array'
     or jsonb_array_length(p_evidence_draft) > 50
     or pg_catalog.pg_column_size(p_evidence_draft) > 262144
     or p_elapsed_seconds is null
     or p_elapsed_seconds < 0
     or p_elapsed_seconds > 2678400
     or p_used_hint_ids is null
     or cardinality(p_used_hint_ids) > 100 then
    raise exception 'invalid draft payload' using errcode = '22023';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.learner_id = actor_id
  for update;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select context.* into context_record
  from app_private.current_actor_exact_attempt_context(p_attempt_id) context;
  if not found or attempt_record.state not in (
    'in_progress', 'revision_required'
  ) then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select count(distinct selected_id) into distinct_selected_count
  from unnest(p_selected_option_ids) selected_id;
  if distinct_selected_count <> cardinality(p_selected_option_ids) then
    raise exception 'selected options must be distinct'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_selected_option_ids) selected_id
    where not exists (
      select 1
      from jsonb_array_elements(
        context_record.task_payload -> 'options'
      ) option_payload
      where option_payload.value ->> 'id' = selected_id::text
    )
  ) then
    raise exception 'selected option does not belong to the attempt task'
      using errcode = '22023';
  end if;

  select count(distinct hint_id) into distinct_hint_count
  from unnest(p_used_hint_ids) hint_id;
  if distinct_hint_count <> cardinality(p_used_hint_ids) then
    raise exception 'used hints must be distinct' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_used_hint_ids) hint_id
    where not exists (
      select 1
      from jsonb_array_elements(
        context_record.task_payload -> 'hints'
      ) hint_payload
      where hint_payload.value ->> 'id' = hint_id::text
    )
  ) then
    raise exception 'used hint does not belong to the attempt task'
      using errcode = '22023';
  end if;

  if p_expected_draft_version = 0 then
    insert into public.attempt_drafts (
      attempt_id, answer_text, selected_option_ids, evidence_draft,
      client_saved_at
    ) values (
      p_attempt_id,
      p_answer_text,
      p_selected_option_ids,
      p_evidence_draft,
      statement_timestamp()
    ) on conflict on constraint attempt_drafts_pkey do nothing
    returning * into draft_record;
  else
    update public.attempt_drafts draft
    set answer_text = p_answer_text,
        selected_option_ids = p_selected_option_ids,
        evidence_draft = p_evidence_draft,
        client_saved_at = statement_timestamp()
    where draft.attempt_id = p_attempt_id
      and draft.row_version = p_expected_draft_version
    returning draft.* into draft_record;
  end if;
  if draft_record.attempt_id is null then
    raise exception 'draft is stale' using errcode = '40001';
  end if;

  insert into public.attempt_hint_usage (attempt_id, hint_id)
  select p_attempt_id, hint_id
  from unnest(p_used_hint_ids) hint_id
  on conflict on constraint attempt_hint_usage_pkey do nothing;

  update public.attempts attempt
  set elapsed_seconds = greatest(
        attempt.elapsed_seconds, p_elapsed_seconds
      ),
      hint_used = attempt.hint_used or cardinality(p_used_hint_ids) > 0,
      hint_first_used_at = case
        when attempt.hint_first_used_at is not null
          then attempt.hint_first_used_at
        when cardinality(p_used_hint_ids) > 0
          then (
            select min(usage.first_used_at)
            from public.attempt_hint_usage usage
            where usage.attempt_id = attempt.id
          )
        else null
      end,
      last_activity_at = statement_timestamp()
  where attempt.id = p_attempt_id
  returning attempt.* into refreshed_attempt;

  return query select
    refreshed_attempt.id,
    draft_record.row_version,
    refreshed_attempt.row_version,
    refreshed_attempt.elapsed_seconds,
    refreshed_attempt.hint_used,
    refreshed_attempt.hint_first_used_at,
    draft_record.updated_at;
end;
$$;

alter function public.save_attempt_draft(
  uuid, bigint, text, uuid[], jsonb, integer, uuid[]
) owner to postgres;
revoke all on function public.save_attempt_draft(
  uuid, bigint, text, uuid[], jsonb, integer, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.save_attempt_draft(
  uuid, bigint, text, uuid[], jsonb, integer, uuid[]
) to authenticated, service_role;

-- Narrow evidence creation boundary for the learner task workspace. Tenant,
-- owner and task identity are derived from the locked exact attempt; browser
-- table INSERT is revoked above.
create or replace function public.create_external_task_evidence(
  p_attempt_id uuid,
  p_title text,
  p_source_uri text,
  p_sha256_hex text,
  p_idempotency_key text
)
returns public.evidence
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  attempt_record public.attempts;
  context_record record;
  normalized_title text := nullif(btrim(p_title), '');
  normalized_uri text := btrim(p_source_uri);
  normalized_hash text := lower(btrim(p_sha256_hex));
  payload_hash text;
  receipt_record public.attempt_command_receipts;
  evidence_record public.evidence;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attempt_id is null
     or normalized_title is null
     or length(normalized_title) > 255
     or p_source_uri is null
     or length(normalized_uri) > 2048
     or normalized_uri !~ '^https://[^[:space:]]+$'
     or p_sha256_hex is null
     or normalized_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200 then
    raise exception 'invalid external evidence payload'
      using errcode = '22023';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.learner_id = v_actor_id
  for update;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select context.* into context_record
  from app_private.current_actor_exact_attempt_context(p_attempt_id) context;
  if not found
     or attempt_record.state not in ('in_progress', 'revision_required') then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'create_external_task_evidence',
      'actor_id', v_actor_id,
      'organization_id', attempt_record.organization_id,
      'enrollment_id', attempt_record.enrollment_id,
      'cohort_id', attempt_record.cohort_id,
      'course_id', attempt_record.course_id,
      'content_version_id', attempt_record.content_version_id,
      'task_id', attempt_record.task_id,
      'attempt_id', attempt_record.id,
      'title', normalized_title,
      'source_uri', normalized_uri,
      'sha256_hex', normalized_hash
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'attempt-receipt:' || v_actor_id::text
        || ':create_external_task_evidence:' || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.attempt_command_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.operation = 'create_external_task_evidence'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.attempt_id <> attempt_record.id
       or receipt_record.organization_id <> attempt_record.organization_id
       or receipt_record.enrollment_id <> attempt_record.enrollment_id
       or receipt_record.cohort_id <> attempt_record.cohort_id
       or receipt_record.course_id <> attempt_record.course_id
       or receipt_record.content_version_id <>
         attempt_record.content_version_id
       or receipt_record.task_id <> attempt_record.task_id
       or receipt_record.payload_hash <> payload_hash then
      raise exception 'external evidence idempotency conflict'
        using errcode = '23505';
    end if;
    select evidence.* into evidence_record
    from public.evidence evidence
    where evidence.id = receipt_record.evidence_id
      and evidence.organization_id = attempt_record.organization_id
      and evidence.owner_id = v_actor_id
      and evidence.task_id = attempt_record.task_id;
    if not found then
      raise exception 'external evidence receipt is corrupt'
        using errcode = '55000';
    end if;
    return evidence_record;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'external-evidence:' || v_actor_id::text || ':' || normalized_hash,
      0
    )
  );

  select evidence.* into evidence_record
  from public.evidence evidence
  where evidence.owner_id = v_actor_id
    and evidence.sha256_hex = normalized_hash
    and evidence.evidence_kind = 'external';
  if evidence_record.id is not null then
    if evidence_record.organization_id <> attempt_record.organization_id
       or evidence_record.task_id is distinct from attempt_record.task_id
       or evidence_record.title <> normalized_title
       or evidence_record.source_uri <> normalized_uri then
      raise exception 'external evidence digest is already bound elsewhere'
        using errcode = '23505';
    end if;
  else
    insert into public.evidence (
      organization_id, owner_id, task_id, evidence_kind, title,
      source_uri, sha256_hex, metadata
    ) values (
      attempt_record.organization_id,
      v_actor_id,
      attempt_record.task_id,
      'external',
      normalized_title,
      normalized_uri,
      normalized_hash,
      jsonb_build_object(
        'source', 'learner_external_link',
        'attempt_id', attempt_record.id,
        'enrollment_id', attempt_record.enrollment_id,
        'content_version_id', attempt_record.content_version_id
      )
    ) returning * into evidence_record;
  end if;

  insert into public.attempt_command_receipts (
    actor_id, operation, organization_id, enrollment_id, cohort_id,
    course_id, content_version_id, task_id, attempt_id, evidence_id,
    expected_attempt_row_version, idempotency_key, payload_hash,
    correlation_id
  ) values (
    v_actor_id,
    'create_external_task_evidence',
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.id,
    evidence_record.id,
    attempt_record.row_version,
    p_idempotency_key,
    payload_hash,
    app_private.uuid7()
  ) returning * into receipt_record;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    attempt_record.organization_id,
    v_actor_id,
    'learner',
    'evidence.created',
    'evidence',
    evidence_record.id,
    1,
    receipt_record.correlation_id,
    jsonb_build_object(
      'attempt_id', attempt_record.id,
      'enrollment_id', attempt_record.enrollment_id,
      'content_version_id', attempt_record.content_version_id,
      'task_id', attempt_record.task_id,
      'evidence_kind', evidence_record.evidence_kind
    )
  );

  return evidence_record;
end;
$$;

alter function public.create_external_task_evidence(
  uuid, text, text, text, text
) owner to postgres;
revoke all on function public.create_external_task_evidence(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_external_task_evidence(
  uuid, text, text, text, text
) to authenticated, service_role;


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
  v_actor_id uuid := (select auth.uid());
  attempt_record public.attempts;
  context_record record;
  submission_record public.submissions;
  version_record public.submission_versions;
  receipt_record public.attempt_command_receipts;
  normalized_selected_ids uuid[];
  normalized_evidence_ids uuid[];
  assessment_payload jsonb;
  selection_mode text;
  minimum_selections integer;
  maximum_selections integer;
  evidence_required boolean;
  evidence_count bigint;
  version_number integer;
  target_submission_state public.submission_state;
  target_attempt_state public.attempt_state;
  payload_hash text;
  task_stage_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attempt_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_answer_text is null
     or length(p_answer_text) > 50000
     or p_selected_option_ids is null
     or cardinality(p_selected_option_ids) > 100
     or p_evidence_refs is null
     or cardinality(p_evidence_refs) > 50
     or p_correlation_id is null then
    raise exception 'invalid submission payload' using errcode = '22023';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.learner_id = v_actor_id
  for update;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select context.* into context_record
  from app_private.current_actor_exact_attempt_context(p_attempt_id) context;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select coalesce(
    array_agg(selected_id order by selected_id), '{}'::uuid[]
  ) into normalized_selected_ids
  from (
    select distinct selected_id
    from unnest(p_selected_option_ids) selected_id
  ) normalized_selection;
  if cardinality(normalized_selected_ids) <>
    cardinality(p_selected_option_ids) then
    raise exception 'selected options must be distinct'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(evidence_id order by evidence_id), '{}'::uuid[]
  ) into normalized_evidence_ids
  from (
    select distinct evidence_id
    from unnest(p_evidence_refs) evidence_id
  ) normalized_evidence;
  if cardinality(normalized_evidence_ids) <>
    cardinality(p_evidence_refs) then
    raise exception 'evidence references must be distinct'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_answer_text), '') is null
     or context_record.task_payload ->> 'task_kind'
       not in ('practical', 'knowledge') then
    raise exception 'a written answer is required for this task'
      using errcode = '22023';
  end if;

  assessment_payload := context_record.task_payload -> 'assessment';
  if assessment_payload is null
     or assessment_payload = 'null'::jsonb then
    if cardinality(normalized_selected_ids) <> 0 then
      raise exception 'this task does not accept assessment selections'
        using errcode = '22023';
    end if;
  else
    if jsonb_typeof(assessment_payload) is distinct from 'object'
       or jsonb_typeof(assessment_payload -> 'selection_mode')
         is distinct from 'string'
       or jsonb_typeof(assessment_payload -> 'minimum_selections')
         is distinct from 'number'
       or (assessment_payload ->> 'minimum_selections') !~
         '^[1-9][0-9]*$'
       or (
         assessment_payload -> 'maximum_selections' <> 'null'::jsonb
         and (
           jsonb_typeof(assessment_payload -> 'maximum_selections')
             is distinct from 'number'
           or (assessment_payload ->> 'maximum_selections') !~
             '^[1-9][0-9]*$'
         )
       ) then
      raise exception 'published assessment contract is invalid'
        using errcode = '55000';
    end if;
    selection_mode := assessment_payload ->> 'selection_mode';
    minimum_selections :=
      (assessment_payload ->> 'minimum_selections')::integer;
    maximum_selections := case
      when assessment_payload -> 'maximum_selections' = 'null'::jsonb
        then jsonb_array_length(context_record.task_payload -> 'options')
      else (assessment_payload ->> 'maximum_selections')::integer
    end;
    if selection_mode not in ('single', 'multiple')
       or minimum_selections > maximum_selections
       or (
         selection_mode = 'single'
         and (
           minimum_selections <> 1
           or maximum_selections <> 1
         )
       )
       or cardinality(normalized_selected_ids) < minimum_selections
       or cardinality(normalized_selected_ids) > maximum_selections then
      raise exception 'assessment selection cardinality is invalid'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from unnest(normalized_selected_ids) selected_id
      where not exists (
        select 1
        from jsonb_array_elements(
          context_record.task_payload -> 'options'
        ) option_payload
        where option_payload.value ->> 'id' = selected_id::text
      )
    ) then
      raise exception 'selected option does not belong to the publication'
        using errcode = '22023';
    end if;
  end if;

  evidence_required := exists (
    select 1
    from jsonb_array_elements(
      context_record.task_payload -> 'skill_mappings'
    ) mapping_payload
    where mapping_payload.value ->> 'evidence_required' = 'true'
  );
  if evidence_required and cardinality(normalized_evidence_ids) = 0 then
    raise exception 'verified evidence is required for this task'
      using errcode = '22023';
  end if;

  perform evidence_record.id
  from public.evidence evidence_record
  where evidence_record.id = any(normalized_evidence_ids)
  order by evidence_record.id
  for share;

  select count(*) into evidence_count
  from public.evidence evidence_record
  where evidence_record.id = any(normalized_evidence_ids)
    and evidence_record.organization_id = attempt_record.organization_id
    and evidence_record.owner_id = v_actor_id
    and evidence_record.task_id = attempt_record.task_id
    and evidence_record.captured_at <= statement_timestamp()
    and (
      evidence_record.submission_version_id is null
      or exists (
        select 1
        from public.submission_versions prior_version
        join public.submissions prior_submission
          on prior_submission.id = prior_version.submission_id
        where prior_version.id = evidence_record.submission_version_id
          and prior_submission.attempt_id = attempt_record.id
      )
    );
  if evidence_count <> cardinality(normalized_evidence_ids) then
    raise exception 'evidence does not belong to the exact learner task'
      using errcode = '22023';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'submit_attempt',
      'actor_id', v_actor_id,
      'organization_id', attempt_record.organization_id,
      'enrollment_id', attempt_record.enrollment_id,
      'cohort_id', attempt_record.cohort_id,
      'course_id', attempt_record.course_id,
      'content_version_id', attempt_record.content_version_id,
      'task_id', attempt_record.task_id,
      'attempt_id', attempt_record.id,
      'expected_attempt_row_version', p_expected_version,
      'answer_text', p_answer_text,
      'selected_option_ids', to_jsonb(normalized_selected_ids),
      'evidence_refs', to_jsonb(normalized_evidence_ids)
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'attempt-receipt:' || v_actor_id::text || ':submit_attempt:'
        || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.attempt_command_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.operation = 'submit_attempt'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.attempt_id <> attempt_record.id
       or receipt_record.organization_id <> attempt_record.organization_id
       or receipt_record.enrollment_id <> attempt_record.enrollment_id
       or receipt_record.cohort_id <> attempt_record.cohort_id
       or receipt_record.course_id <> attempt_record.course_id
       or receipt_record.content_version_id <>
         attempt_record.content_version_id
       or receipt_record.task_id <> attempt_record.task_id
       or receipt_record.expected_attempt_row_version <>
         p_expected_version
       or receipt_record.payload_hash <> payload_hash then
      raise exception 'submission idempotency conflict'
        using errcode = '23505';
    end if;
    select submission.* into submission_record
    from public.submissions submission
    where submission.id = receipt_record.submission_id
      and submission.attempt_id = attempt_record.id;
    if not found then
      raise exception 'submission receipt is corrupt' using errcode = '55000';
    end if;
    return submission_record;
  end if;

  if attempt_record.row_version <> p_expected_version
     or attempt_record.state not in ('in_progress', 'revision_required') then
    raise exception 'attempt is stale or not submittable'
      using errcode = '40001';
  end if;

  if attempt_record.state = 'in_progress'
     and app_private.learner_snapshot_task_lock_reasons(
       attempt_record.enrollment_id,
       attempt_record.organization_id,
       attempt_record.cohort_id,
       context_record.progression_mode,
       attempt_record.content_version_id,
       context_record.content_snapshot,
       context_record.task_payload
     ) <> '[]'::jsonb then
    raise exception 'task is not currently available'
      using errcode = '42501';
  end if;

  select submission.* into submission_record
  from public.submissions submission
  where submission.attempt_id = attempt_record.id
  for update;

  if attempt_record.state = 'in_progress' then
    if submission_record.id is not null then
      raise exception 'first submission aggregate is corrupt'
        using errcode = '55000';
    end if;
    target_submission_state := 'submitted';
    target_attempt_state := 'submitted';
    version_number := 1;
    insert into public.submissions (
      organization_id, attempt_id, enrollment_id, learner_id, cohort_id,
      course_id, content_version_id, task_id, state,
      latest_version_number
    ) values (
      attempt_record.organization_id,
      attempt_record.id,
      attempt_record.enrollment_id,
      v_actor_id,
      attempt_record.cohort_id,
      attempt_record.course_id,
      attempt_record.content_version_id,
      attempt_record.task_id,
      target_submission_state,
      version_number
    ) returning * into submission_record;
  else
    if submission_record.id is null
       or submission_record.state <> 'revision_required' then
      raise exception 'submission is not revision-ready'
        using errcode = '40001';
    end if;
    target_submission_state := 'resubmitted';
    target_attempt_state := 'resubmitted';
    version_number := submission_record.latest_version_number + 1;
    update public.submissions submission
    set state = target_submission_state,
        latest_version_number = version_number
    where submission.id = submission_record.id
      and submission.state = 'revision_required'
    returning submission.* into submission_record;
    if not found then
      raise exception 'submission is not revision-ready'
        using errcode = '40001';
    end if;
  end if;

  select task_record.stage_id into task_stage_id
  from public.tasks task_record
  where task_record.id = attempt_record.task_id
    and task_record.course_id = attempt_record.course_id
    and task_record.content_version_id = attempt_record.content_version_id;
  if not found then
    raise exception 'submission task publication is corrupt'
      using errcode = '55000';
  end if;

  insert into public.submission_versions (
    submission_id, version_number, idempotency_key, answer_text,
    selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
    task_snapshot, submitted_by
  ) values (
    submission_record.id,
    version_number,
    p_idempotency_key,
    p_answer_text,
    p_selected_option_ids,
    p_evidence_refs,
    attempt_record.elapsed_seconds,
    attempt_record.hint_used,
    jsonb_build_object(
      'task_id', attempt_record.task_id,
      'course_id', attempt_record.course_id,
      'stage_id', task_stage_id,
      'content_version_id', attempt_record.content_version_id,
      'task_kind', context_record.task_payload ->> 'task_kind',
      'target_url', context_record.task_payload -> 'target_url',
      'assessment', context_record.task_payload -> 'assessment',
      'skill_mappings', context_record.task_payload -> 'skill_mappings'
    ),
    v_actor_id
  ) returning * into version_record;

  insert into public.submission_answers (
    submission_version_id, answer_text
  ) values (
    version_record.id, p_answer_text
  );
  insert into public.submission_answers (
    submission_version_id, task_option_id
  )
  select version_record.id, selected_id
  from unnest(p_selected_option_ids) selected_id;

  insert into public.submission_version_evidence (
    submission_version_id, submission_id, evidence_id, organization_id,
    learner_id, task_id, position
  )
  select
    version_record.id,
    submission_record.id,
    evidence_ref.evidence_id,
    submission_record.organization_id,
    submission_record.learner_id,
    submission_record.task_id,
    evidence_ref.ordinality - 1
  from unnest(p_evidence_refs)
    with ordinality evidence_ref(evidence_id, ordinality);

  insert into public.submission_version_hint_usage (
    submission_version_id, submission_id, attempt_id, task_id, hint_id,
    first_used_at
  )
  select
    version_record.id,
    submission_record.id,
    attempt_record.id,
    attempt_record.task_id,
    usage_record.hint_id,
    usage_record.first_used_at
  from public.attempt_hint_usage usage_record
  where usage_record.attempt_id = attempt_record.id;

  update public.attempts attempt
  set state = target_attempt_state,
      submitted_at = statement_timestamp(),
      last_activity_at = statement_timestamp()
  where attempt.id = attempt_record.id
    and attempt.row_version = p_expected_version;
  if not found then
    raise exception 'attempt became stale' using errcode = '40001';
  end if;

  delete from public.attempt_drafts draft
  where draft.attempt_id = attempt_record.id;

  insert into public.attempt_command_receipts (
    actor_id, operation, organization_id, enrollment_id, cohort_id,
    course_id, content_version_id, task_id, attempt_id, submission_id,
    submission_version_id, expected_attempt_row_version, idempotency_key,
    payload_hash, correlation_id
  ) values (
    v_actor_id,
    'submit_attempt',
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.id,
    submission_record.id,
    version_record.id,
    p_expected_version,
    p_idempotency_key,
    payload_hash,
    p_correlation_id
  ) returning * into receipt_record;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    submission_record.organization_id,
    v_actor_id,
    'learner',
    'submission.submitted',
    'submission',
    submission_record.id,
    submission_record.row_version,
    p_correlation_id,
    jsonb_build_object(
      'attempt_id', attempt_record.id,
      'enrollment_id', attempt_record.enrollment_id,
      'content_version_id', attempt_record.content_version_id,
      'submission_version_id', version_record.id,
      'version_number', version_number,
      'state', submission_record.state
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    submission_record.organization_id,
    'submission',
    submission_record.id,
    submission_record.row_version,
    'submission.submitted.v1',
    1,
    p_correlation_id,
    jsonb_build_object(
      'submission_id', submission_record.id,
      'submission_version_id', version_record.id,
      'learner_id', v_actor_id,
      'enrollment_id', attempt_record.enrollment_id,
      'cohort_id', attempt_record.cohort_id,
      'content_version_id', attempt_record.content_version_id,
      'task_id', attempt_record.task_id,
      'version_number', version_number
    )
  );

  return submission_record;
end;
$$;

alter function public.submit_attempt(
  uuid, bigint, text, text, uuid[], uuid[], uuid
) owner to postgres;
revoke all on function public.submit_attempt(
  uuid, bigint, text, text, uuid[], uuid[], uuid
) from public, anon, authenticated, service_role;
grant execute on function public.submit_attempt(
  uuid, bigint, text, text, uuid[], uuid[], uuid
) to authenticated, service_role;

-- Abandoned is a canonical terminal state. It must never fall through to the
-- editable draft presentation or silently create another attempt without an
-- approved restart rule. The learner may still read the allowlisted task
-- projection so the UI can explain the terminal state instead of reporting a
-- misleading authorization failure when availability later changes.
create or replace function app_private.get_my_learning_task_without_requirements(
  p_task_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_task as (
    select
      context_record.*,
      (stage_record.value ->> 'id')::uuid as stage_id,
      task_record.value as task_payload,
      schedule_record.available_from,
      latest_attempt.state as latest_attempt_state
    from app_private.current_actor_pinned_course_context(null::uuid)
      context_record
    cross join lateral jsonb_array_elements(context_record.snapshot -> 'stages')
      stage_record
    cross join lateral jsonb_array_elements(stage_record.value -> 'tasks')
      task_record
    left join public.task_schedules schedule_record
      on schedule_record.cohort_id = context_record.cohort_id
     and schedule_record.task_id = p_task_id
    left join lateral (
      select attempt_record.state
      from public.attempts attempt_record
      where attempt_record.enrollment_id = context_record.enrollment_id
        and attempt_record.learner_id = (select auth.uid())
        and attempt_record.cohort_id = context_record.cohort_id
        and attempt_record.task_id = p_task_id
      order by attempt_record.sequence_number desc, attempt_record.id desc
      limit 1
    ) latest_attempt on true
    where context_record.enrollment_state = 'assigned'
      and (task_record.value ->> 'id')::uuid = p_task_id
      and (
        app_private.learner_task_is_currently_available(
          context_record.organization_id,
          context_record.cohort_id,
          context_record.progression_mode,
          p_task_id
        )
        or latest_attempt.state in (
          'in_progress', 'submitted', 'revision_required', 'resubmitted',
          'abandoned'
        )
      )
    order by context_record.enrollment_updated_at desc,
      context_record.enrollment_id
    limit 1
  )
  select jsonb_build_object(
    'id', p_task_id,
    'version_number', task_record.version_number,
    'content_version_id', task_record.content_version_id,
    'content_version_state', task_record.content_version_state,
    'course_id', task_record.course_id,
    'enrollment_id', task_record.enrollment_id,
    'cohort_id', task_record.cohort_id,
    'cohort_state', task_record.cohort_state,
    'stage_id', task_record.stage_id,
    'title', app_private.snapshot_localized_text_map(
      task_record.task_payload -> 'localizations', 'title', false
    ),
    'instructions', app_private.snapshot_localized_text_map(
      task_record.task_payload -> 'localizations', 'instructions_html', true
    ),
    'target_url', case
      when task_record.task_payload -> 'target_url' = 'null'::jsonb then null
      else task_record.task_payload ->> 'target_url'
    end,
    'hint', (
      select jsonb_build_object(
        'id', (hint_record.value ->> 'id')::uuid,
        'content', jsonb_build_object(
          'en', hint_record.value #>> '{content_translations,en}',
          'de', hint_record.value #>> '{content_translations,de}',
          'ru', hint_record.value #>> '{content_translations,ru}'
        )
      )
      from jsonb_array_elements(task_record.task_payload -> 'hints') hint_record
      order by
        (hint_record.value ->> 'position')::integer,
        hint_record.value ->> 'id'
      limit 1
    ),
    'assessment', case
      when jsonb_typeof(task_record.task_payload -> 'assessment') = 'object'
      then jsonb_build_object(
        'id', 'assessment:' || p_task_id::text,
        'question', jsonb_build_object(
          'en', task_record.task_payload
            #>> '{assessment,question_translations,en}',
          'de', task_record.task_payload
            #>> '{assessment,question_translations,de}',
          'ru', task_record.task_payload
            #>> '{assessment,question_translations,ru}'
        ),
        'selection_mode', task_record.task_payload
          #>> '{assessment,selection_mode}',
        'options', (
          select jsonb_agg(
            jsonb_build_object(
              'id', (option_record.value ->> 'id')::uuid,
              'label', jsonb_build_object(
                'en', option_record.value #>> '{labels,en}',
                'de', option_record.value #>> '{labels,de}',
                'ru', option_record.value #>> '{labels,ru}'
              )
            )
            order by
              (option_record.value ->> 'position')::integer,
              option_record.value ->> 'id'
          )
          from jsonb_array_elements(
            task_record.task_payload -> 'options'
          ) option_record
        )
      )
      else null
    end,
    'activated_at', task_record.available_from,
    'access', 'available'
  )
  from selected_task task_record;
$$;

alter function app_private.get_my_learning_task_without_requirements(uuid)
  owner to postgres;
revoke all on function
  app_private.get_my_learning_task_without_requirements(uuid)
  from public, anon, authenticated, service_role;

create or replace function app_private.learner_course_activity_state(
  p_enrollment_id uuid,
  p_enrollment_state public.enrollment_state,
  p_organization_id uuid,
  p_cohort_id uuid,
  p_progression_mode text,
  p_task_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  latest_state public.attempt_state;
begin
  select attempt_record.state into latest_state
  from public.attempts attempt_record
  where attempt_record.enrollment_id = p_enrollment_id
    and attempt_record.cohort_id = p_cohort_id
    and attempt_record.task_id = p_task_id
    and attempt_record.learner_id = (select auth.uid())
  order by attempt_record.sequence_number desc, attempt_record.id desc
  limit 1;

  if p_enrollment_state = 'completed' then
    if latest_state = 'accepted' then return 'accepted'; end if;
    return 'locked';
  end if;

  if latest_state = 'accepted' then return 'accepted'; end if;
  if latest_state = 'abandoned' then return 'locked'; end if;
  if latest_state = 'revision_required' then return 'revision_required'; end if;
  if latest_state in ('submitted', 'resubmitted') then return 'submitted'; end if;
  if latest_state = 'in_progress' then return 'in_progress'; end if;
  if app_private.learner_task_is_currently_available(
    p_organization_id, p_cohort_id, p_progression_mode, p_task_id
  ) then
    return 'available';
  end if;
  return 'locked';
end;
$$;

alter function app_private.learner_course_activity_state(
  uuid, public.enrollment_state, uuid, uuid, text, uuid
) owner to postgres;
revoke all on function app_private.learner_course_activity_state(
  uuid, public.enrollment_state, uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.get_my_learning_task(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  context_record record;
  task_payload jsonb;
  latest_state public.attempt_state;
  reasons jsonb;
begin
  select pinned_context.* into context_record
  from app_private.current_actor_pinned_course_context(null::uuid)
    pinned_context
  where pinned_context.enrollment_state = 'assigned'
    and app_private.snapshot_task_payload(
      pinned_context.snapshot, p_task_id
    ) is not null
  order by pinned_context.enrollment_updated_at desc,
    pinned_context.enrollment_id
  limit 1;
  if context_record.enrollment_id is null then return null; end if;

  task_payload := app_private.snapshot_task_payload(
    context_record.snapshot, p_task_id
  );
  reasons := app_private.learner_snapshot_task_lock_reasons(
    context_record.enrollment_id,
    context_record.organization_id,
    context_record.cohort_id,
    context_record.progression_mode,
    context_record.content_version_id,
    context_record.snapshot,
    task_payload
  );

  select attempt_record.state into latest_state
  from public.attempts attempt_record
  where attempt_record.enrollment_id = context_record.enrollment_id
    and attempt_record.learner_id = (select auth.uid())
    and attempt_record.cohort_id = context_record.cohort_id
    and attempt_record.task_id = p_task_id
  order by attempt_record.sequence_number desc, attempt_record.id desc
  limit 1;

  if reasons <> '[]'::jsonb
     and (
       latest_state is null
       or latest_state not in (
         'in_progress', 'submitted', 'revision_required', 'resubmitted',
         'abandoned'
       )
     ) then
    return null;
  end if;

  return app_private.get_my_learning_task_without_requirements(p_task_id);
end;
$$;

alter function public.get_my_learning_task(uuid) owner to postgres;
revoke all on function public.get_my_learning_task(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_learning_task(uuid)
  to authenticated, service_role;

-- Minimal immutable-history projection. It derives the actor and the one
-- current tenant, reads terminal cohort pins as historical attribution, and
-- never exposes answers, comments, evidence metadata or active workspace data.
create or replace function public.list_my_learning_history(
  p_locale text default 'en',
  p_snapshot_at timestamptz default statement_timestamp(),
  p_before_occurred_at timestamptz default null,
  p_before_event_id text default null,
  p_limit integer default 20
)
returns table (
  event_id text,
  event_kind text,
  occurred_at timestamptz,
  organization_id uuid,
  course_id uuid,
  cohort_id uuid,
  task_id uuid,
  question_id uuid,
  ordinal integer,
  course_title text,
  task_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_organization_id uuid;
  organization_count bigint;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_snapshot_at is null
     or p_snapshot_at > statement_timestamp() + interval '5 minutes'
     or p_limit is null
     or p_limit not between 1 and 100
     or (
       (p_before_occurred_at is null) <>
       (p_before_event_id is null)
     )
     or (
       p_before_event_id is not null
       and length(p_before_event_id) not between 3 and 200
     ) then
    raise exception 'invalid learner history cursor' using errcode = '22023';
  end if;

  with eligible_organizations as (
    select distinct assignment_record.organization_id
    from public.user_roles assignment_record
    where assignment_record.user_id = actor_id
      and assignment_record.organization_id is not null
      and app_private.current_actor_has_learner_history_scope(
        assignment_record.organization_id
      )
  )
  select
    (array_agg(
      eligible.organization_id order by eligible.organization_id
    ))[1],
    count(*)
  into actor_organization_id, organization_count
  from eligible_organizations eligible;
  if organization_count <> 1 then
    raise exception 'learner history requires one active tenant scope'
      using errcode = '42501';
  end if;

  return query
  with historical_cohorts as materialized (
    select
      cohort_record.id,
      cohort_record.organization_id,
      cohort_record.course_id,
      cohort_record.content_version_id,
      version_record.snapshot,
      version_record.snapshot #>> '{course,default_locale}' as default_locale,
      app_private.resolve_snapshot_localization(
        version_record.snapshot #> '{course,localizations}',
        p_locale,
        version_record.snapshot #>> '{course,default_locale}'
      ) ->> 'title' as course_title
    from public.cohorts cohort_record
    join public.content_versions version_record
      on version_record.id = cohort_record.content_version_id
     and version_record.course_id = cohort_record.course_id
     and version_record.state in ('published', 'archived')
    where cohort_record.organization_id = actor_organization_id
  ), raw_events as (
    select
      'course_requested:' || enrollment_record.id::text as event_id,
      'course_requested'::text as event_kind,
      enrollment_record.created_at as occurred_at,
      enrollment_record.organization_id,
      enrollment_record.course_id,
      enrollment_record.cohort_id,
      null::uuid as task_id,
      null::uuid as question_id,
      null::integer as ordinal,
      cohort_context.course_title,
      null::text as task_title
    from public.enrollments enrollment_record
    left join historical_cohorts cohort_context
      on cohort_context.id = enrollment_record.cohort_id
     and cohort_context.course_id = enrollment_record.course_id
    where enrollment_record.learner_id = actor_id
      and enrollment_record.organization_id = actor_organization_id

    union all
    select
      'course_approved:' || enrollment_record.id::text,
      'course_approved',
      enrollment_record.decided_at,
      enrollment_record.organization_id,
      enrollment_record.course_id,
      enrollment_record.cohort_id,
      null::uuid,
      null::uuid,
      null::integer,
      cohort_context.course_title,
      null::text
    from public.enrollments enrollment_record
    left join historical_cohorts cohort_context
      on cohort_context.id = enrollment_record.cohort_id
     and cohort_context.course_id = enrollment_record.course_id
    where enrollment_record.learner_id = actor_id
      and enrollment_record.organization_id = actor_organization_id
      and enrollment_record.state = 'approved'
      and enrollment_record.decided_at is not null

    union all
    select
      'course_assigned:' || enrollment_record.id::text,
      'course_assigned',
      enrollment_record.decided_at,
      enrollment_record.organization_id,
      enrollment_record.course_id,
      enrollment_record.cohort_id,
      null::uuid,
      null::uuid,
      null::integer,
      cohort_context.course_title,
      null::text
    from public.enrollments enrollment_record
    join historical_cohorts cohort_context
      on cohort_context.id = enrollment_record.cohort_id
     and cohort_context.course_id = enrollment_record.course_id
    where enrollment_record.learner_id = actor_id
      and enrollment_record.organization_id = actor_organization_id
      and enrollment_record.state in ('assigned', 'completed')
      and enrollment_record.decided_at is not null

    union all
    select
      'course_rejected:' || enrollment_record.id::text,
      'course_rejected',
      enrollment_record.decided_at,
      enrollment_record.organization_id,
      enrollment_record.course_id,
      enrollment_record.cohort_id,
      null::uuid,
      null::uuid,
      null::integer,
      cohort_context.course_title,
      null::text
    from public.enrollments enrollment_record
    left join historical_cohorts cohort_context
      on cohort_context.id = enrollment_record.cohort_id
     and cohort_context.course_id = enrollment_record.course_id
    where enrollment_record.learner_id = actor_id
      and enrollment_record.organization_id = actor_organization_id
      and enrollment_record.state = 'rejected'
      and enrollment_record.decided_at is not null

    union all
    select
      'course_cancelled:' || enrollment_record.id::text,
      'course_cancelled',
      enrollment_record.updated_at,
      enrollment_record.organization_id,
      enrollment_record.course_id,
      enrollment_record.cohort_id,
      null::uuid,
      null::uuid,
      null::integer,
      cohort_context.course_title,
      null::text
    from public.enrollments enrollment_record
    join historical_cohorts cohort_context
      on cohort_context.id = enrollment_record.cohort_id
     and cohort_context.course_id = enrollment_record.course_id
    where enrollment_record.learner_id = actor_id
      and enrollment_record.organization_id = actor_organization_id
      and enrollment_record.state = 'cancelled'

    union all
    select
      'course_completed:' || enrollment_record.id::text,
      'course_completed',
      enrollment_record.completed_at,
      enrollment_record.organization_id,
      enrollment_record.course_id,
      enrollment_record.cohort_id,
      null::uuid,
      null::uuid,
      null::integer,
      cohort_context.course_title,
      null::text
    from public.enrollments enrollment_record
    join historical_cohorts cohort_context
      on cohort_context.id = enrollment_record.cohort_id
     and cohort_context.course_id = enrollment_record.course_id
    where enrollment_record.learner_id = actor_id
      and enrollment_record.organization_id = actor_organization_id
      and enrollment_record.state = 'completed'
      and enrollment_record.completed_at is not null

    union all
    select
      'attempt_started:' || attempt_record.id::text,
      'attempt_started',
      attempt_record.started_at,
      attempt_record.organization_id,
      attempt_record.course_id,
      attempt_record.cohort_id,
      attempt_record.task_id,
      null::uuid,
      attempt_record.sequence_number,
      cohort_context.course_title,
      app_private.resolve_snapshot_localization(
        app_private.snapshot_task_payload(
          cohort_context.snapshot, attempt_record.task_id
        ) -> 'localizations',
        p_locale,
        cohort_context.default_locale
      ) ->> 'title'
    from public.attempts attempt_record
    join historical_cohorts cohort_context
      on cohort_context.id = attempt_record.cohort_id
     and cohort_context.course_id = attempt_record.course_id
     and cohort_context.content_version_id = attempt_record.content_version_id
    where attempt_record.learner_id = actor_id
      and attempt_record.organization_id = actor_organization_id

    union all
    select
      case when version_record.version_number = 1
        then 'task_submitted:' else 'task_resubmitted:' end
        || version_record.id::text,
      case when version_record.version_number = 1
        then 'task_submitted' else 'task_resubmitted' end,
      version_record.submitted_at,
      submission_record.organization_id,
      submission_record.course_id,
      submission_record.cohort_id,
      submission_record.task_id,
      null::uuid,
      version_record.version_number,
      cohort_context.course_title,
      app_private.resolve_snapshot_localization(
        app_private.snapshot_task_payload(
          cohort_context.snapshot, submission_record.task_id
        ) -> 'localizations',
        p_locale,
        cohort_context.default_locale
      ) ->> 'title'
    from public.submission_versions version_record
    join public.submissions submission_record
      on submission_record.id = version_record.submission_id
    join historical_cohorts cohort_context
      on cohort_context.id = submission_record.cohort_id
     and cohort_context.course_id = submission_record.course_id
     and cohort_context.content_version_id =
       submission_record.content_version_id
    where submission_record.learner_id = actor_id
      and version_record.submitted_by = actor_id
      and submission_record.organization_id = actor_organization_id

    union all
    select
      case when review_record.decision = 'accepted'
        then 'review_accepted:' else 'review_revision_required:' end
        || review_record.id::text,
      case when review_record.decision = 'accepted'
        then 'review_accepted' else 'review_revision_required' end,
      review_record.created_at,
      submission_record.organization_id,
      submission_record.course_id,
      submission_record.cohort_id,
      submission_record.task_id,
      null::uuid,
      null::integer,
      cohort_context.course_title,
      app_private.resolve_snapshot_localization(
        app_private.snapshot_task_payload(
          cohort_context.snapshot, submission_record.task_id
        ) -> 'localizations',
        p_locale,
        cohort_context.default_locale
      ) ->> 'title'
    from public.reviews review_record
    join public.submissions submission_record
      on submission_record.id = review_record.submission_id
     and submission_record.organization_id = review_record.organization_id
    join historical_cohorts cohort_context
      on cohort_context.id = submission_record.cohort_id
     and cohort_context.course_id = submission_record.course_id
     and cohort_context.content_version_id =
       submission_record.content_version_id
    where submission_record.learner_id = actor_id
      and submission_record.organization_id = actor_organization_id

    union all
    select
      'question_asked:' || question_record.id::text,
      'question_asked',
      question_record.created_at,
      question_record.organization_id,
      cohort_context.course_id,
      question_record.cohort_id,
      question_record.task_id,
      question_record.id,
      null::integer,
      cohort_context.course_title,
      app_private.resolve_snapshot_localization(
        app_private.snapshot_task_payload(
          cohort_context.snapshot, question_record.task_id
        ) -> 'localizations',
        p_locale,
        cohort_context.default_locale
      ) ->> 'title'
    from public.questions question_record
    join historical_cohorts cohort_context
      on cohort_context.id = question_record.cohort_id
     and cohort_context.content_version_id = question_record.content_version_id
    where question_record.learner_id = actor_id
      and question_record.organization_id = actor_organization_id

    union all
    select
      'question_answered:' || question_record.id::text,
      'question_answered',
      question_record.answered_at,
      question_record.organization_id,
      cohort_context.course_id,
      question_record.cohort_id,
      question_record.task_id,
      question_record.id,
      null::integer,
      cohort_context.course_title,
      app_private.resolve_snapshot_localization(
        app_private.snapshot_task_payload(
          cohort_context.snapshot, question_record.task_id
        ) -> 'localizations',
        p_locale,
        cohort_context.default_locale
      ) ->> 'title'
    from public.questions question_record
    join historical_cohorts cohort_context
      on cohort_context.id = question_record.cohort_id
     and cohort_context.content_version_id = question_record.content_version_id
    where question_record.learner_id = actor_id
      and question_record.organization_id = actor_organization_id
      and question_record.answered_at is not null

    union all
    select
      'question_archived:' || question_record.id::text,
      'question_archived',
      question_record.archived_at,
      question_record.organization_id,
      cohort_context.course_id,
      question_record.cohort_id,
      question_record.task_id,
      question_record.id,
      null::integer,
      cohort_context.course_title,
      app_private.resolve_snapshot_localization(
        app_private.snapshot_task_payload(
          cohort_context.snapshot, question_record.task_id
        ) -> 'localizations',
        p_locale,
        cohort_context.default_locale
      ) ->> 'title'
    from public.questions question_record
    join historical_cohorts cohort_context
      on cohort_context.id = question_record.cohort_id
     and cohort_context.content_version_id = question_record.content_version_id
    where question_record.learner_id = actor_id
      and question_record.organization_id = actor_organization_id
      and question_record.archived_at is not null

    union all
    select
      'certificate_issued:' || certificate_record.id::text,
      'certificate_issued',
      certificate_record.issued_at,
      certificate_record.organization_id,
      certificate_record.course_id,
      null::uuid,
      null::uuid,
      null::uuid,
      null::integer,
      null::text,
      null::text
    from public.certificates certificate_record
    where certificate_record.learner_id = actor_id
      and certificate_record.organization_id = actor_organization_id
      and certificate_record.issued_at is not null

    union all
    select
      'certificate_available:' || certificate_record.id::text,
      'certificate_available',
      certificate_record.available_at,
      certificate_record.organization_id,
      certificate_record.course_id,
      null::uuid,
      null::uuid,
      null::uuid,
      null::integer,
      null::text,
      null::text
    from public.certificates certificate_record
    where certificate_record.learner_id = actor_id
      and certificate_record.organization_id = actor_organization_id
      and certificate_record.available_at is not null

    union all
    select
      'certificate_revoked:' || certificate_record.id::text,
      'certificate_revoked',
      certificate_record.revoked_at,
      certificate_record.organization_id,
      certificate_record.course_id,
      null::uuid,
      null::uuid,
      null::uuid,
      null::integer,
      null::text,
      null::text
    from public.certificates certificate_record
    where certificate_record.learner_id = actor_id
      and certificate_record.organization_id = actor_organization_id
      and certificate_record.revoked_at is not null

    union all
    select
      'certificate_expired:' || certificate_record.id::text,
      'certificate_expired',
      certificate_record.expires_at,
      certificate_record.organization_id,
      certificate_record.course_id,
      null::uuid,
      null::uuid,
      null::uuid,
      null::integer,
      null::text,
      null::text
    from public.certificates certificate_record
    where certificate_record.learner_id = actor_id
      and certificate_record.organization_id = actor_organization_id
      and certificate_record.state = 'expired'
      and certificate_record.expires_at is not null
  ), bounded_events as (
    select raw_event.*
    from raw_events raw_event
    where raw_event.occurred_at <= p_snapshot_at
      and (
        p_before_occurred_at is null
        or (raw_event.occurred_at, raw_event.event_id) <
          (p_before_occurred_at, p_before_event_id)
      )
    order by raw_event.occurred_at desc, raw_event.event_id desc
    limit p_limit
  )
  select
    bounded_event.event_id,
    bounded_event.event_kind,
    bounded_event.occurred_at,
    bounded_event.organization_id,
    bounded_event.course_id,
    bounded_event.cohort_id,
    bounded_event.task_id,
    bounded_event.question_id,
    bounded_event.ordinal,
    bounded_event.course_title,
    bounded_event.task_title
  from bounded_events bounded_event
  order by bounded_event.occurred_at desc, bounded_event.event_id desc;
end;
$$;

alter function public.list_my_learning_history(
  text, timestamptz, timestamptz, text, integer
) owner to postgres;
revoke all on function public.list_my_learning_history(
  text, timestamptz, timestamptz, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.list_my_learning_history(
  text, timestamptz, timestamptz, text, integer
) to authenticated, service_role;

-- Review and resubmission touch the same attempt/submission aggregate. Acquire
-- the attempt first here as submit_attempt does, removing the inverse lock
-- order that could deadlock a trainer decision against a learner resubmission.
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
  aggregate_attempt_id uuid;
  locked_attempt public.attempts;
  submission_record public.submissions;
  latest_transfer public.review_transfers;
  actor_is_trainer boolean;
  actor_can_manage boolean;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select submission.attempt_id into aggregate_attempt_id
  from public.submissions submission
  where submission.id = p_submission_id;
  if aggregate_attempt_id is null then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  select attempt.* into locked_attempt
  from public.attempts attempt
  where attempt.id = aggregate_attempt_id
  for update;
  if not found then
    raise exception 'review aggregate is corrupt' using errcode = '55000';
  end if;

  select submission.* into submission_record
  from public.submissions submission
  join public.cohorts cohort_record
    on cohort_record.id = submission.cohort_id
   and cohort_record.organization_id = submission.organization_id
   and cohort_record.course_id = submission.course_id
   and cohort_record.content_version_id = submission.content_version_id
   and cohort_record.state = 'active'
  join public.organizations organization_record
    on organization_record.id = submission.organization_id
   and organization_record.state = 'active'
   and organization_record.archived_at is null
  join public.tasks task_record
    on task_record.id = submission.task_id
   and task_record.course_id = submission.course_id
   and task_record.content_version_id = submission.content_version_id
  where submission.id = p_submission_id
    and submission.attempt_id = locked_attempt.id
  for update of submission;

  if submission_record.id is null then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  actor_is_trainer := app_private.is_active_cohort_review_trainer(
    actor_id,
    submission_record.cohort_id,
    submission_record.organization_id
  );
  actor_can_manage := app_private.has_permission(
    'cohort.manage',
    submission_record.organization_id,
    submission_record.cohort_id
  );
  if not actor_is_trainer and not actor_can_manage then
    raise exception 'review scope denied' using errcode = '42501';
  end if;

  select transfer.* into latest_transfer
  from public.review_transfers transfer
  where transfer.submission_id = submission_record.id
  order by transfer.created_at desc, transfer.id desc
  limit 1;
  if latest_transfer.id is not null
     and latest_transfer.to_trainer_id <> actor_id
     and not actor_can_manage then
    raise exception 'submission review ownership changed'
      using errcode = '42501';
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

alter function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) owner to postgres;
revoke all on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.decide_submission(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) to authenticated, service_role;
