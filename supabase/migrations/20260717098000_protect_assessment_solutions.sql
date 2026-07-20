-- P1 security correction: learner-readable option/localization rows must never
-- contain assessment correctness or trainer model answers.

create table public.task_option_answers (
  task_option_id uuid primary key references public.task_options(id) on delete cascade,
  is_correct boolean not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index task_option_answers_updated_by_idx
  on public.task_option_answers (updated_by) where updated_by is not null;

insert into public.task_option_answers (task_option_id, is_correct)
select id, is_correct from public.task_options;

alter table public.task_options drop column is_correct;

create table public.task_model_answers (
  task_localization_id uuid primary key references public.task_localizations(id) on delete cascade,
  model_answer text not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint task_model_answers_not_blank check (length(btrim(model_answer)) > 0)
);

create index task_model_answers_updated_by_idx
  on public.task_model_answers (updated_by) where updated_by is not null;

insert into public.task_model_answers (task_localization_id, model_answer)
select id, model_answer
from public.task_localizations
where nullif(btrim(model_answer), '') is not null;

alter table public.task_localizations drop column model_answer;

create trigger task_option_answers_set_updated_at
before update on public.task_option_answers
for each row execute function app_private.set_updated_at();

create trigger task_model_answers_set_updated_at
before update on public.task_model_answers
for each row execute function app_private.set_updated_at();

alter table public.task_option_answers enable row level security;
alter table public.task_option_answers force row level security;
alter table public.task_model_answers enable row level security;
alter table public.task_model_answers force row level security;

revoke all on public.task_option_answers, public.task_model_answers from anon, authenticated;
grant select, insert, update, delete on public.task_option_answers, public.task_model_answers to authenticated;

create policy task_option_answers_reviewer_read on public.task_option_answers
  for select to authenticated
  using (exists (
    select 1
    from public.task_options option_row
    join public.tasks task_row on task_row.id = option_row.task_id
    join public.courses course_row on course_row.id = task_row.course_id
    where option_row.id = task_option_id
      and (
        (select app_private.has_permission('content.manage', course_row.organization_id))
        or exists (
          select 1
          from public.task_schedules schedule_row
          join public.cohort_memberships membership_row
            on membership_row.cohort_id = schedule_row.cohort_id
          where schedule_row.task_id = task_row.id
            and membership_row.user_id = (select auth.uid())
            and membership_row.role = 'trainer'
            and membership_row.state = 'active'
        )
      )
  ));

create policy task_option_answers_content_write on public.task_option_answers
  for all to authenticated
  using (exists (
    select 1
    from public.task_options option_row
    join public.tasks task_row on task_row.id = option_row.task_id
    join public.courses course_row on course_row.id = task_row.course_id
    where option_row.id = task_option_id
      and (select app_private.has_permission('content.manage', course_row.organization_id))
  ))
  with check (exists (
    select 1
    from public.task_options option_row
    join public.tasks task_row on task_row.id = option_row.task_id
    join public.courses course_row on course_row.id = task_row.course_id
    where option_row.id = task_option_id
      and (select app_private.has_permission('content.manage', course_row.organization_id))
  ));

create policy task_model_answers_reviewer_read on public.task_model_answers
  for select to authenticated
  using (exists (
    select 1
    from public.task_localizations localization_row
    join public.tasks task_row on task_row.id = localization_row.task_id
    join public.courses course_row on course_row.id = task_row.course_id
    where localization_row.id = task_localization_id
      and (
        (select app_private.has_permission('content.manage', course_row.organization_id))
        or exists (
          select 1
          from public.task_schedules schedule_row
          join public.cohort_memberships membership_row
            on membership_row.cohort_id = schedule_row.cohort_id
          where schedule_row.task_id = task_row.id
            and membership_row.user_id = (select auth.uid())
            and membership_row.role = 'trainer'
            and membership_row.state = 'active'
        )
      )
  ));

create policy task_model_answers_content_write on public.task_model_answers
  for all to authenticated
  using (exists (
    select 1
    from public.task_localizations localization_row
    join public.tasks task_row on task_row.id = localization_row.task_id
    join public.courses course_row on course_row.id = task_row.course_id
    where localization_row.id = task_localization_id
      and (select app_private.has_permission('content.manage', course_row.organization_id))
  ))
  with check (exists (
    select 1
    from public.task_localizations localization_row
    join public.tasks task_row on task_row.id = localization_row.task_id
    join public.courses course_row on course_row.id = task_row.course_id
    where localization_row.id = task_localization_id
      and (select app_private.has_permission('content.manage', course_row.organization_id))
  ));

