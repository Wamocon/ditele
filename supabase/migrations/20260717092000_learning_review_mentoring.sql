-- Learner attempts, immutable submission versions, trainer review and mentoring.

create table public.attempts (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete restrict,
  sequence_number integer not null default 1 check (sequence_number > 0),
  state public.attempt_state not null default 'in_progress',
  started_at timestamptz not null default statement_timestamp(),
  last_activity_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz,
  accepted_at timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  hint_used boolean not null default false,
  hint_first_used_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint attempts_enrollment_task_sequence_unique unique (enrollment_id, task_id, sequence_number),
  constraint attempts_hint_consistency check ((hint_used and hint_first_used_at is not null) or (not hint_used and hint_first_used_at is null)),
  constraint attempts_submission_consistency check (submitted_at is null or submitted_at >= started_at)
);

create unique index attempts_active_task_uidx on public.attempts (enrollment_id, task_id) where state in ('in_progress', 'submitted', 'revision_required', 'resubmitted');
create index attempts_learner_state_idx on public.attempts (learner_id, state, updated_at desc);
create index attempts_cohort_state_idx on public.attempts (cohort_id, state, updated_at desc);
create index attempts_task_state_idx on public.attempts (task_id, state, created_at desc);
create index attempts_org_state_idx on public.attempts (organization_id, state, updated_at desc);

create table public.attempt_drafts (
  attempt_id uuid primary key references public.attempts(id) on delete cascade,
  answer_text text not null default '',
  selected_option_ids uuid[] not null default '{}',
  evidence_draft jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_draft) = 'array'),
  client_saved_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.submissions (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  attempt_id uuid not null unique references public.attempts(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete restrict,
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete restrict,
  state public.submission_state not null default 'submitted',
  latest_version_number integer not null default 1 check (latest_version_number > 0),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  accepted_at timestamptz,
  constraint submissions_acceptance_consistency check ((state = 'accepted' and accepted_at is not null) or state <> 'accepted')
);

create index submissions_learner_state_idx on public.submissions (learner_id, state, updated_at desc);
create index submissions_cohort_queue_idx on public.submissions (cohort_id, state, updated_at) where state in ('submitted', 'resubmitted');
create index submissions_task_state_idx on public.submissions (task_id, state, updated_at desc);
create index submissions_org_queue_idx on public.submissions (organization_id, state, updated_at) where state in ('submitted', 'resubmitted', 'revision_required');

create table public.submission_versions (
  id uuid primary key default app_private.uuid7(),
  submission_id uuid not null references public.submissions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  idempotency_key text not null,
  answer_text text not null default '',
  selected_option_ids uuid[] not null default '{}',
  evidence_refs uuid[] not null default '{}',
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  hint_used boolean not null,
  task_snapshot jsonb not null check (jsonb_typeof(task_snapshot) = 'object'),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint submission_versions_submission_number_unique unique (submission_id, version_number),
  constraint submission_versions_idempotency_unique unique (submission_id, idempotency_key),
  constraint submission_versions_idempotency_length check (length(idempotency_key) between 16 and 200)
);

create index submission_versions_submission_created_idx on public.submission_versions (submission_id, version_number desc, created_at desc);
create index submission_versions_submitted_by_idx on public.submission_versions (submitted_by, submitted_at desc);

create table public.submission_answers (
  id uuid primary key default app_private.uuid7(),
  submission_version_id uuid not null references public.submission_versions(id) on delete restrict,
  task_option_id uuid references public.task_options(id) on delete restrict,
  answer_text text,
  created_at timestamptz not null default statement_timestamp(),
  constraint submission_answers_has_value check (task_option_id is not null or nullif(btrim(answer_text), '') is not null)
);

create unique index submission_answers_option_uidx on public.submission_answers (submission_version_id, task_option_id) where task_option_id is not null;
create index submission_answers_version_idx on public.submission_answers (submission_version_id, created_at);
create index submission_answers_option_idx on public.submission_answers (task_option_id) where task_option_id is not null;

create table public.reviews (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  submission_id uuid not null references public.submissions(id) on delete restrict,
  submission_version_id uuid not null unique references public.submission_versions(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision public.review_decision not null check (decision in ('accepted', 'revision_required')),
  comment text not null,
  idempotency_key text not null,
  expected_submission_row_version bigint not null check (expected_submission_row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  constraint reviews_comment_not_blank check (length(btrim(comment)) > 0),
  constraint reviews_idempotency_length check (length(idempotency_key) between 16 and 200),
  constraint reviews_submission_idempotency_unique unique (submission_id, idempotency_key)
);

create index reviews_submission_created_idx on public.reviews (submission_id, created_at desc);
create index reviews_reviewer_created_idx on public.reviews (reviewer_id, created_at desc);
create index reviews_org_created_idx on public.reviews (organization_id, created_at desc);

create table public.review_transfers (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  submission_id uuid not null references public.submissions(id) on delete restrict,
  from_trainer_id uuid not null references auth.users(id) on delete restrict,
  to_trainer_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  idempotency_key text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint review_transfers_different_trainers check (from_trainer_id <> to_trainer_id),
  constraint review_transfers_reason_not_blank check (length(btrim(reason)) > 0),
  constraint review_transfers_idempotency_unique unique (submission_id, idempotency_key)
);

create index review_transfers_submission_created_idx on public.review_transfers (submission_id, created_at desc);
create index review_transfers_from_idx on public.review_transfers (from_trainer_id, created_at desc);
create index review_transfers_to_idx on public.review_transfers (to_trainer_id, created_at desc);
create index review_transfers_org_idx on public.review_transfers (organization_id, created_at desc);

create table public.questions (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete restrict,
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete restrict,
  assigned_trainer_id uuid references auth.users(id) on delete restrict,
  state public.question_state not null default 'open',
  subject text not null,
  idempotency_key text not null,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  answered_at timestamptz,
  archived_at timestamptz,
  constraint questions_subject_not_blank check (length(btrim(subject)) > 0),
  constraint questions_idempotency_unique unique (learner_id, idempotency_key),
  constraint questions_assignment_consistency check (
    (state = 'open' and assigned_trainer_id is null)
    or (state <> 'open')
  )
);

create index questions_learner_state_idx on public.questions (learner_id, state, updated_at desc);
create index questions_trainer_queue_idx on public.questions (assigned_trainer_id, state, created_at) where state in ('assigned', 'transferred');
create index questions_cohort_queue_idx on public.questions (cohort_id, state, created_at) where state in ('open', 'assigned', 'transferred');
create index questions_task_idx on public.questions (task_id, created_at desc);
create index questions_org_queue_idx on public.questions (organization_id, state, created_at) where state in ('open', 'assigned', 'transferred');

create table public.question_messages (
  id uuid primary key default app_private.uuid7(),
  question_id uuid not null references public.questions(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  message_kind text not null default 'message' check (message_kind in ('message', 'answer', 'system')),
  created_at timestamptz not null default statement_timestamp(),
  constraint question_messages_body_not_blank check (length(btrim(body)) > 0)
);

create index question_messages_question_created_idx on public.question_messages (question_id, created_at);
create index question_messages_author_idx on public.question_messages (author_id, created_at desc);

create table public.question_transfers (
  id uuid primary key default app_private.uuid7(),
  question_id uuid not null references public.questions(id) on delete restrict,
  from_trainer_id uuid not null references auth.users(id) on delete restrict,
  to_trainer_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  idempotency_key text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint question_transfers_different_trainers check (from_trainer_id <> to_trainer_id),
  constraint question_transfers_reason_not_blank check (length(btrim(reason)) > 0),
  constraint question_transfers_idempotency_unique unique (question_id, idempotency_key)
);

create index question_transfers_question_created_idx on public.question_transfers (question_id, created_at desc);
create index question_transfers_from_idx on public.question_transfers (from_trainer_id, created_at desc);
create index question_transfers_to_idx on public.question_transfers (to_trainer_id, created_at desc);

create table public.ratings (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text,
  moderation_state text not null default 'visible' check (moderation_state in ('visible', 'hidden', 'flagged')),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint ratings_one_target check ((course_id is not null)::integer + (task_id is not null)::integer = 1)
);

create unique index ratings_course_learner_uidx on public.ratings (learner_id, course_id) where course_id is not null;
create unique index ratings_task_learner_uidx on public.ratings (learner_id, task_id) where task_id is not null;
create index ratings_org_target_idx on public.ratings (organization_id, created_at desc);
create index ratings_course_idx on public.ratings (course_id, created_at desc) where course_id is not null;
create index ratings_task_idx on public.ratings (task_id, created_at desc) where task_id is not null;

create trigger attempts_bump_row_version before update on public.attempts for each row execute function app_private.bump_row_version();
create trigger attempt_drafts_bump_row_version before update on public.attempt_drafts for each row execute function app_private.bump_row_version();
create trigger submissions_bump_row_version before update on public.submissions for each row execute function app_private.bump_row_version();
create trigger questions_bump_row_version before update on public.questions for each row execute function app_private.bump_row_version();
create trigger ratings_bump_row_version before update on public.ratings for each row execute function app_private.bump_row_version();

create trigger submission_versions_immutable
before update or delete on public.submission_versions
for each row execute function app_private.reject_mutation();

create trigger submission_answers_immutable
before update or delete on public.submission_answers
for each row execute function app_private.reject_mutation();

create trigger reviews_immutable
before update or delete on public.reviews
for each row execute function app_private.reject_mutation();

create trigger review_transfers_immutable
before update or delete on public.review_transfers
for each row execute function app_private.reject_mutation();

create trigger question_messages_immutable
before update or delete on public.question_messages
for each row execute function app_private.reject_mutation();

create trigger question_transfers_immutable
before update or delete on public.question_transfers
for each row execute function app_private.reject_mutation();

create or replace function app_private.reject_published_content_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'published' then
    raise exception 'published content versions are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app_private.reject_published_content_mutation() from public, anon, authenticated;

create trigger content_versions_published_immutable
before update or delete on public.content_versions
for each row execute function app_private.reject_published_content_mutation();

