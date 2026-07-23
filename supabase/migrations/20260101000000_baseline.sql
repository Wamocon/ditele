-- =====================================================================
-- Ditele — clean baseline schema (see ditele_schema.md)
-- Single source of truth. Course + course tasks + arena tasks.
-- No groups / stages / cohorts / organizations.
-- =====================================================================

create extension if not exists pgcrypto;

-- ── Helper schema (SECURITY DEFINER authz helpers; bypass RLS, no recursion) ──
create schema if not exists app;

-- ── Enums ────────────────────────────────────────────────────────────
create type public.user_role       as enum ('student','trainer','admin');
create type public.course_state    as enum ('active','inactive','archived','deleted');
create type public.task_state      as enum ('active','inactive','archived','deleted');
create type public.submission_kind as enum ('course','arena');
create type public.submission_state as enum ('in_progress','submitted','accepted','needs_revision');
create type public.review_decision as enum ('accepted','needs_revision');
create type public.enrollment_state as enum ('active','completed');

-- ── updated_at trigger ───────────────────────────────────────────────
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

-- =====================================================================
-- Identity
-- =====================================================================
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         public.user_role not null default 'student',
  display_name text not null default '',
  avatar_url   text,
  locale       text not null default 'de',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- =====================================================================
-- Courses & tasks
-- =====================================================================
create table public.courses (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  title                text not null,
  description          text not null default '',
  cover_image_url      text,
  intro_video_url      text,
  completion_video_url text,
  state                public.course_state not null default 'active',
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger courses_touch before update on public.courses
  for each row execute function app.touch_updated_at();

-- Global ordered arena chain (referenced by course_tasks, so defined first)
create table public.arena_tasks (
  id           uuid primary key default gen_random_uuid(),
  order_index  integer not null default 0,
  title        text not null,
  description  text not null default '',
  html_window  text not null default '',      -- HTML shown to the student to inspect
  hint         text,
  xp_reward    integer not null default 0 check (xp_reward >= 0),
  badge_id     uuid,                            -- FK added after badges exists
  state        public.task_state not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger arena_tasks_touch before update on public.arena_tasks
  for each row execute function app.touch_updated_at();

-- Trainer/admin-only judging material for an arena task
create table public.arena_task_answer (
  arena_task_id       uuid primary key references public.arena_tasks(id) on delete cascade,
  acceptance_criteria text not null default '',  -- how to judge (trainer/admin only)
  answer_key          text not null default ''   -- reference answer / planted bugs
);

create table public.course_tasks (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.courses(id) on delete cascade,
  order_index       integer not null default 0,
  title             text not null,
  description       text not null default '',
  hint              text,
  video_before_url  text,
  video_after_url   text,
  mcq_question      text,                         -- the mandatory question; null = no gate question
  arena_task_id     uuid references public.arena_tasks(id) on delete set null, -- optional 0/1
  state             public.task_state not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (course_id, order_index)
);
create index course_tasks_course_idx on public.course_tasks(course_id, order_index);
create trigger course_tasks_touch before update on public.course_tasks
  for each row execute function app.touch_updated_at();

create table public.course_task_options (   -- MCQ options (label is student-safe)
  id             uuid primary key default gen_random_uuid(),
  course_task_id uuid not null references public.course_tasks(id) on delete cascade,
  order_index    integer not null default 0,
  label          text not null
);
create index course_task_options_task_idx on public.course_task_options(course_task_id, order_index);

-- Trainer/admin-only answer for a course task (model answer + which options are correct)
create table public.course_task_answer (
  course_task_id      uuid primary key references public.course_tasks(id) on delete cascade,
  verification_answer text not null default '',
  correct_option_ids  uuid[] not null default '{}'
);

-- =====================================================================
-- Rewards
-- =====================================================================
create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  image_url   text,
  created_at  timestamptz not null default now()
);
alter table public.arena_tasks
  add constraint arena_tasks_badge_fk foreign key (badge_id) references public.badges(id) on delete set null;

create table public.badge_awards (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  badge_id      uuid not null references public.badges(id) on delete cascade,
  arena_task_id uuid references public.arena_tasks(id) on delete set null,
  awarded_at    timestamptz not null default now(),
  unique (student_id, badge_id)
);

create table public.xp_ledger (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  arena_task_id uuid references public.arena_tasks(id) on delete set null,
  amount        integer not null,
  created_at    timestamptz not null default now()
);
create index xp_ledger_student_idx on public.xp_ledger(student_id);

-- =====================================================================
-- Enrollment & assignment (admin-managed)
-- =====================================================================
create table public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  state        public.enrollment_state not null default 'active',
  assigned_by  uuid references public.profiles(id),
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (student_id, course_id)
);
create index enrollments_course_idx on public.enrollments(course_id);
create index enrollments_student_idx on public.enrollments(student_id);

create table public.course_trainers (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (course_id, trainer_id)
);
create index course_trainers_trainer_idx on public.course_trainers(trainer_id);

-- =====================================================================
-- Submissions & review
-- =====================================================================
create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  task_kind      public.submission_kind not null,
  course_task_id uuid references public.course_tasks(id) on delete cascade,
  arena_task_id  uuid references public.arena_tasks(id) on delete cascade,
  response_text  text not null default '',
  state          public.submission_state not null default 'in_progress',
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ( (task_kind = 'course' and course_task_id is not null and arena_task_id is null)
       or (task_kind = 'arena'  and arena_task_id  is not null and course_task_id is null) ),
  unique (student_id, course_task_id),
  unique (student_id, arena_task_id)
);
create index submissions_course_task_idx on public.submissions(course_task_id);
create index submissions_arena_task_idx  on public.submissions(arena_task_id);
create index submissions_state_idx       on public.submissions(state);
create trigger submissions_touch before update on public.submissions
  for each row execute function app.touch_updated_at();

create table public.submission_options (  -- MCQ selections (course submissions)
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  option_id     uuid not null references public.course_task_options(id) on delete cascade,
  unique (submission_id, option_id)
);

create table public.submission_images (   -- arena bug-report attachments
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  object_key    text not null,             -- key in the `submission-images` bucket
  caption       text not null default '',
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);
create index submission_images_submission_idx on public.submission_images(submission_id);

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  trainer_id    uuid not null references public.profiles(id),
  decision      public.review_decision not null,
  comment       text not null default '',
  created_at    timestamptz not null default now()
);
create index reviews_submission_idx on public.reviews(submission_id);

-- =====================================================================
-- Feedback
-- =====================================================================
create table public.task_feedback (   -- one-time emoji per course task (-> admin)
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  course_task_id uuid not null references public.course_tasks(id) on delete cascade,
  emoji          text not null,
  created_at     timestamptz not null default now(),
  unique (student_id, course_task_id)
);

create table public.course_feedback ( -- whole-course 5-star + text on completion (-> admin)
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text not null default '',
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

-- =====================================================================
-- Authz helpers (SECURITY DEFINER — read base tables past RLS)
-- =====================================================================
create or replace function app.role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;
create or replace function app.is_staff() returns boolean   -- trainer or admin
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('trainer','admin') from public.profiles where id = auth.uid()), false)
$$;
create or replace function app.trains_course(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin()
     or exists (select 1 from public.course_trainers ct where ct.course_id = cid and ct.trainer_id = auth.uid())
$$;
create or replace function app.enrolled_in(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e where e.course_id = cid and e.student_id = auth.uid())
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.courses             enable row level security;
alter table public.arena_tasks         enable row level security;
alter table public.arena_task_answer   enable row level security;
alter table public.course_tasks        enable row level security;
alter table public.course_task_options enable row level security;
alter table public.course_task_answer  enable row level security;
alter table public.badges              enable row level security;
alter table public.badge_awards        enable row level security;
alter table public.xp_ledger           enable row level security;
alter table public.enrollments         enable row level security;
alter table public.course_trainers     enable row level security;
alter table public.submissions         enable row level security;
alter table public.submission_options  enable row level security;
alter table public.submission_images   enable row level security;
alter table public.reviews             enable row level security;
alter table public.task_feedback       enable row level security;
alter table public.course_feedback     enable row level security;

-- profiles: self read/update; staff read all; admin write all
create policy profiles_self_read   on public.profiles for select using (id = auth.uid() or app.is_staff());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all   on public.profiles for all using (app.is_admin()) with check (app.is_admin());

-- courses: staff read all; enrolled students read their courses; anon reads active (catalog); admin writes
create policy courses_staff_read on public.courses for select using (app.is_staff());
create policy courses_student_read on public.courses for select using (app.enrolled_in(id));
create policy courses_public_read on public.courses for select using (state = 'active');
create policy courses_admin_write on public.courses for all using (app.is_admin()) with check (app.is_admin());

-- arena tasks: student-safe fields readable by any authenticated user; admin writes
create policy arena_tasks_read  on public.arena_tasks for select using (auth.uid() is not null);
create policy arena_tasks_admin on public.arena_tasks for all using (app.is_admin()) with check (app.is_admin());
-- arena answer key: trainer/admin ONLY
create policy arena_answer_staff on public.arena_task_answer for select using (app.is_staff());
create policy arena_answer_admin on public.arena_task_answer for all using (app.is_admin()) with check (app.is_admin());

-- course tasks: staff read all; enrolled students read (safe columns only — answer key is a separate table)
create policy course_tasks_staff_read   on public.course_tasks for select using (app.is_staff());
create policy course_tasks_student_read on public.course_tasks for select using (app.enrolled_in(course_id));
create policy course_tasks_admin_write  on public.course_tasks for all using (app.is_admin()) with check (app.is_admin());

create policy course_options_staff_read   on public.course_task_options for select using (app.is_staff());
create policy course_options_student_read on public.course_task_options for select
  using (exists (select 1 from public.course_tasks t where t.id = course_task_id and app.enrolled_in(t.course_id)));
create policy course_options_admin_write  on public.course_task_options for all using (app.is_admin()) with check (app.is_admin());

-- course/arena answer keys: trainer/admin ONLY (students have NO policy => no access)
create policy course_answer_staff on public.course_task_answer for select using (app.is_staff());
create policy course_answer_admin on public.course_task_answer for all using (app.is_admin()) with check (app.is_admin());

-- badges: everyone authenticated reads catalog; admin writes
create policy badges_read  on public.badges for select using (auth.uid() is not null);
create policy badges_admin on public.badges for all using (app.is_admin()) with check (app.is_admin());

-- badge awards / xp: student own; staff read (for their courses' students -> simplified: staff read all); admin all
create policy badge_awards_own   on public.badge_awards for select using (student_id = auth.uid() or app.is_staff());
create policy badge_awards_admin on public.badge_awards for all using (app.is_admin()) with check (app.is_admin());
create policy xp_own   on public.xp_ledger for select using (student_id = auth.uid() or app.is_staff());
create policy xp_admin on public.xp_ledger for all using (app.is_admin()) with check (app.is_admin());

-- enrollments: student own; trainer of the course; admin writes
create policy enrollments_read on public.enrollments for select
  using (student_id = auth.uid() or app.trains_course(course_id));
create policy enrollments_admin on public.enrollments for all using (app.is_admin()) with check (app.is_admin());

-- course_trainers: trainer sees own; admin writes; staff read
create policy course_trainers_read  on public.course_trainers for select using (trainer_id = auth.uid() or app.is_staff());
create policy course_trainers_admin on public.course_trainers for all using (app.is_admin()) with check (app.is_admin());

-- submissions: student own (read+write); trainer of the course reads; admin all
create policy submissions_student_rw on public.submissions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy submissions_staff_read on public.submissions for select using (
  app.is_admin()
  or (task_kind = 'course' and exists (select 1 from public.course_tasks t where t.id = course_task_id and app.trains_course(t.course_id)))
  or (task_kind = 'arena'  and app.is_staff())
);

create policy submission_options_owner on public.submission_options for all
  using (exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = auth.uid()))
  with check (exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = auth.uid()));
create policy submission_options_staff on public.submission_options for select using (app.is_staff());

create policy submission_images_owner on public.submission_images for all
  using (exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = auth.uid()))
  with check (exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = auth.uid()));
create policy submission_images_staff on public.submission_images for select using (app.is_staff());

-- reviews: trainer of the submission's course writes; student reads reviews of own submissions
create policy reviews_read on public.reviews for select using (
  app.is_staff() or exists (select 1 from public.submissions s where s.id = submission_id and s.student_id = auth.uid())
);
create policy reviews_staff_write on public.reviews for insert with check (app.is_staff());

-- feedback: student writes own; admin reads all; student reads own
create policy task_feedback_own   on public.task_feedback for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy task_feedback_admin on public.task_feedback for select using (app.is_admin());
create policy course_feedback_own   on public.course_feedback for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy course_feedback_admin on public.course_feedback for select using (app.is_admin());

-- =====================================================================
-- Storage buckets
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('avatars','avatars', true), ('submission-images','submission-images', false)
on conflict (id) do nothing;

-- avatars: public read; owner writes their own folder (uid/...)
create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_owner_write on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_owner_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_owner_delete on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- submission-images: owner student writes their folder; staff read
create policy subimg_owner_write on storage.objects for insert
  with check (bucket_id = 'submission-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy subimg_owner_read on storage.objects for select
  using (bucket_id = 'submission-images' and ((storage.foldername(name))[1] = auth.uid()::text or app.is_staff()));
create policy subimg_owner_delete on storage.objects for delete
  using (bucket_id = 'submission-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Grants (Supabase roles). RLS still gates every row.
-- =====================================================================
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- Auto-provision a profile (role student) when a new auth user signs up.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'student',
          coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();
