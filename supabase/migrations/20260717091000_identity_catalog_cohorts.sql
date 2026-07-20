-- Identity, tenant, catalog, authoring, cohort and enrollment core.

create table public.organizations (
  id uuid primary key default app_private.uuid7(),
  slug text not null,
  name text not null,
  state public.organization_state not null default 'active',
  data_residency_region text,
  source_system text,
  external_id text,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_name_not_blank check (length(btrim(name)) > 0),
  constraint organizations_external_pair check ((source_system is null) = (external_id is null))
);

create unique index organizations_slug_uidx on public.organizations (lower(slug)) where archived_at is null;
create unique index organizations_external_uidx on public.organizations (source_system, external_id) where external_id is not null;
create index organizations_state_idx on public.organizations (state, created_at desc);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  locale text not null default 'en' check (locale in ('en', 'de', 'ru')),
  timezone text not null default 'UTC',
  state public.record_state not null default 'active',
  avatar_object_key text,
  source_system text,
  external_id text,
  row_version bigint not null default 1 check (row_version > 0),
  last_seen_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deactivated_at timestamptz,
  constraint profiles_display_name_length check (length(display_name) <= 160),
  constraint profiles_external_pair check ((source_system is null) = (external_id is null))
);

create unique index profiles_external_uidx on public.profiles (source_system, external_id) where external_id is not null;
create index profiles_state_idx on public.profiles (state, created_at desc);

create table public.roles (
  id uuid primary key default app_private.uuid7(),
  code text not null unique,
  description text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  constraint roles_code_format check (code ~ '^[a-z][a-z0-9_]*$')
);

create table public.permissions (
  id uuid primary key default app_private.uuid7(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint permissions_code_format check (code ~ '^[a-z][a-z0-9_.:]*$')
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

create table public.organization_memberships (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state public.membership_state not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  valid_until timestamptz,
  removed_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint organization_memberships_validity check (valid_until is null or valid_until > created_at)
);

create unique index organization_memberships_live_uidx
  on public.organization_memberships (organization_id, user_id)
  where state in ('invited', 'active', 'suspended');
create index organization_memberships_user_state_idx on public.organization_memberships (user_id, state, organization_id);
create index organization_memberships_invited_by_idx on public.organization_memberships (invited_by) where invited_by is not null;
create index organization_memberships_active_org_idx on public.organization_memberships (organization_id, created_at desc) where state = 'active';

create table public.courses (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  slug text not null,
  state public.record_state not null default 'draft',
  default_locale text not null default 'en' check (default_locale in ('en', 'de', 'ru')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  source_system text,
  external_id text,
  row_version bigint not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint courses_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint courses_external_pair check ((source_system is null) = (external_id is null))
);

create unique index courses_global_slug_uidx on public.courses (lower(slug)) where organization_id is null and archived_at is null;
create unique index courses_tenant_slug_uidx on public.courses (organization_id, lower(slug)) where organization_id is not null and archived_at is null;
create unique index courses_external_uidx on public.courses (source_system, external_id) where external_id is not null;
create index courses_organization_state_idx on public.courses (organization_id, state, created_at desc);
create index courses_created_by_idx on public.courses (created_by) where created_by is not null;

create table public.course_localizations (
  id uuid primary key default app_private.uuid7(),
  course_id uuid not null references public.courses(id) on delete cascade,
  locale text not null check (locale in ('en', 'de', 'ru')),
  title text not null,
  summary text not null,
  description_html text not null,
  learning_outcomes jsonb not null default '[]'::jsonb check (jsonb_typeof(learning_outcomes) = 'array'),
  seo_title text,
  seo_description text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint course_localizations_title_not_blank check (length(btrim(title)) > 0),
  constraint course_localizations_course_locale_unique unique (course_id, locale)
);

create index course_localizations_locale_idx on public.course_localizations (locale, course_id);

create table public.content_versions (
  id uuid primary key default app_private.uuid7(),
  course_id uuid not null references public.courses(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  state public.content_version_state not null default 'draft',
  change_summary text,
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint content_versions_course_number_unique unique (course_id, version_number),
  constraint content_versions_publication_consistency check (
    (state = 'published' and published_at is not null)
    or (state <> 'published')
  )
);

create index content_versions_course_state_idx on public.content_versions (course_id, state, version_number desc);
create index content_versions_created_by_idx on public.content_versions (created_by) where created_by is not null;
create index content_versions_published_by_idx on public.content_versions (published_by) where published_by is not null;

create table public.content_reviews (
  id uuid primary key default app_private.uuid7(),
  content_version_id uuid not null references public.content_versions(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved', 'changes_requested')),
  comment text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint content_reviews_comment_not_blank check (length(btrim(comment)) > 0)
);

create index content_reviews_version_created_idx on public.content_reviews (content_version_id, created_at desc);
create index content_reviews_reviewer_idx on public.content_reviews (reviewer_id, created_at desc);

create table public.stages (
  id uuid primary key default app_private.uuid7(),
  course_id uuid not null references public.courses(id) on delete cascade,
  content_version_id uuid references public.content_versions(id) on delete restrict,
  position integer not null check (position >= 0),
  state public.record_state not null default 'draft',
  source_system text,
  external_id text,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint stages_course_position_unique unique (course_id, position),
  constraint stages_external_pair check ((source_system is null) = (external_id is null))
);

create unique index stages_external_uidx on public.stages (source_system, external_id) where external_id is not null;
create index stages_content_version_idx on public.stages (content_version_id) where content_version_id is not null;
create index stages_course_state_idx on public.stages (course_id, state, position);

create table public.stage_localizations (
  id uuid primary key default app_private.uuid7(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  locale text not null check (locale in ('en', 'de', 'ru')),
  title text not null,
  description_html text not null default '',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint stage_localizations_stage_locale_unique unique (stage_id, locale),
  constraint stage_localizations_title_not_blank check (length(btrim(title)) > 0)
);

create index stage_localizations_locale_idx on public.stage_localizations (locale, stage_id);

create table public.media_assets (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  course_id uuid references public.courses(id) on delete cascade,
  stage_id uuid references public.stages(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  object_key text not null unique,
  media_kind text not null check (media_kind in ('video', 'image', 'document', 'evidence', 'certificate')),
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0 and byte_size <= 26214400),
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  state public.record_state not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz
);

create index media_assets_organization_kind_idx on public.media_assets (organization_id, media_kind, created_at desc);
create index media_assets_course_idx on public.media_assets (course_id, created_at desc) where course_id is not null;
create index media_assets_stage_idx on public.media_assets (stage_id, created_at desc) where stage_id is not null;
create index media_assets_owner_idx on public.media_assets (owner_id, created_at desc) where owner_id is not null;

create table public.bug_categories (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null,
  labels jsonb not null default '{}'::jsonb check (jsonb_typeof(labels) = 'object'),
  state public.record_state not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create unique index bug_categories_global_code_uidx on public.bug_categories (code) where organization_id is null;
create unique index bug_categories_tenant_code_uidx on public.bug_categories (organization_id, code) where organization_id is not null;
create index bug_categories_organization_state_idx on public.bug_categories (organization_id, state, code);

create table public.tasks (
  id uuid primary key default app_private.uuid7(),
  course_id uuid not null references public.courses(id) on delete cascade,
  stage_id uuid not null references public.stages(id) on delete cascade,
  content_version_id uuid references public.content_versions(id) on delete restrict,
  bug_category_id uuid references public.bug_categories(id) on delete set null,
  position integer not null check (position >= 0),
  task_kind text not null default 'practical' check (task_kind in ('practical', 'knowledge', 'placement')),
  state public.record_state not null default 'draft',
  target_url text,
  expected_minutes integer check (expected_minutes is null or expected_minutes > 0),
  hint_penalty_basis_points integer not null default 0 check (hint_penalty_basis_points between 0 and 10000),
  source_system text,
  external_id text,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint tasks_stage_position_unique unique (stage_id, position),
  constraint tasks_external_pair check ((source_system is null) = (external_id is null)),
  constraint tasks_target_url_protocol check (target_url is null or target_url ~ '^https?://')
);

create unique index tasks_external_uidx on public.tasks (source_system, external_id) where external_id is not null;
create index tasks_course_state_idx on public.tasks (course_id, state, stage_id, position);
create index tasks_stage_state_idx on public.tasks (stage_id, state, position);
create index tasks_content_version_idx on public.tasks (content_version_id) where content_version_id is not null;
create index tasks_bug_category_idx on public.tasks (bug_category_id) where bug_category_id is not null;

create table public.task_localizations (
  id uuid primary key default app_private.uuid7(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  locale text not null check (locale in ('en', 'de', 'ru')),
  title text not null,
  instructions_html text not null,
  hint_text text,
  model_answer text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint task_localizations_task_locale_unique unique (task_id, locale),
  constraint task_localizations_title_not_blank check (length(btrim(title)) > 0)
);

create index task_localizations_locale_idx on public.task_localizations (locale, task_id);

create table public.task_options (
  id uuid primary key default app_private.uuid7(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  option_key text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  is_correct boolean not null default false,
  position integer not null check (position >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint task_options_task_key_unique unique (task_id, option_key),
  constraint task_options_task_position_unique unique (task_id, position)
);

create index task_options_task_correct_idx on public.task_options (task_id, is_correct, position);

create table public.cohorts (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  name text not null,
  state public.cohort_state not null default 'waiting',
  progression_mode text not null default 'scheduled' check (progression_mode in ('scheduled', 'flexible')),
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  source_system text,
  external_id text,
  row_version bigint not null default 1 check (row_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint cohorts_name_not_blank check (length(btrim(name)) > 0),
  constraint cohorts_schedule_order check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint cohorts_external_pair check ((source_system is null) = (external_id is null))
);

create unique index cohorts_external_uidx on public.cohorts (source_system, external_id) where external_id is not null;
create unique index cohorts_live_name_uidx on public.cohorts (organization_id, course_id, lower(name)) where state in ('waiting', 'active');
create index cohorts_organization_state_idx on public.cohorts (organization_id, state, starts_at, created_at desc);
create index cohorts_course_state_idx on public.cohorts (course_id, state, created_at desc);
create index cohorts_created_by_idx on public.cohorts (created_by) where created_by is not null;

create table public.cohort_memberships (
  id uuid primary key default app_private.uuid7(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.cohort_member_role not null,
  state public.membership_state not null default 'active',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default statement_timestamp(),
  removed_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create unique index cohort_memberships_live_uidx on public.cohort_memberships (cohort_id, user_id, role) where state in ('invited', 'active', 'suspended');
create index cohort_memberships_user_scope_idx on public.cohort_memberships (user_id, role, state, cohort_id);
create index cohort_memberships_active_cohort_idx on public.cohort_memberships (cohort_id, role, assigned_at) where state = 'active';
create index cohort_memberships_assigned_by_idx on public.cohort_memberships (assigned_by) where assigned_by is not null;

create table public.user_roles (
  id uuid primary key default app_private.uuid7(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  reason text not null,
  valid_from timestamptz not null default statement_timestamp(),
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint user_roles_scope check (cohort_id is null or organization_id is not null),
  constraint user_roles_validity check (valid_until is null or valid_until > valid_from),
  constraint user_roles_reason_not_blank check (length(btrim(reason)) > 0)
);

create unique index user_roles_live_scope_uidx
  on public.user_roles (user_id, role_id, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index user_roles_user_valid_idx on public.user_roles (user_id, valid_from, valid_until) where revoked_at is null;
create index user_roles_role_scope_idx on public.user_roles (role_id, organization_id, cohort_id) where revoked_at is null;
create index user_roles_organization_idx on public.user_roles (organization_id) where organization_id is not null;
create index user_roles_cohort_idx on public.user_roles (cohort_id) where cohort_id is not null;
create index user_roles_granted_by_idx on public.user_roles (granted_by) where granted_by is not null;

create table public.impersonation_sessions (
  id uuid primary key default app_private.uuid7(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  subject_user_id uuid references auth.users(id) on delete restrict,
  viewed_role_id uuid not null references public.roles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  reason text not null,
  correlation_id uuid not null,
  started_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint impersonation_sessions_reason_not_blank check (length(btrim(reason)) >= 8),
  constraint impersonation_sessions_expiry check (expires_at > started_at and expires_at <= started_at + interval '4 hours')
);

create index impersonation_sessions_actor_active_idx on public.impersonation_sessions (actor_user_id, expires_at) where ended_at is null;
create index impersonation_sessions_subject_idx on public.impersonation_sessions (subject_user_id, started_at desc) where subject_user_id is not null;
create index impersonation_sessions_role_idx on public.impersonation_sessions (viewed_role_id, started_at desc);
create index impersonation_sessions_organization_idx on public.impersonation_sessions (organization_id, started_at desc) where organization_id is not null;

create table public.task_schedules (
  id uuid primary key default app_private.uuid7(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  available_from timestamptz,
  due_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  change_reason text not null default 'initial schedule',
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint task_schedules_cohort_task_unique unique (cohort_id, task_id),
  constraint task_schedules_order check (due_at is null or available_from is null or due_at > available_from),
  constraint task_schedules_reason_not_blank check (length(btrim(change_reason)) > 0)
);

create index task_schedules_task_idx on public.task_schedules (task_id, available_from);
create index task_schedules_available_idx on public.task_schedules (cohort_id, available_from, due_at);
create index task_schedules_changed_by_idx on public.task_schedules (changed_by) where changed_by is not null;

create table public.enrollments (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  cohort_id uuid references public.cohorts(id) on delete restrict,
  state public.enrollment_state not null default 'requested',
  request_note text,
  decision_reason text,
  idempotency_key text not null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint enrollments_idempotency_key_length check (length(idempotency_key) between 16 and 200),
  constraint enrollments_decision_consistency check (
    (state in ('approved', 'rejected', 'assigned', 'cancelled', 'completed') and decided_at is not null)
    or state = 'requested'
  )
);

create unique index enrollments_idempotency_uidx on public.enrollments (learner_id, idempotency_key);
create unique index enrollments_live_course_uidx on public.enrollments (learner_id, course_id) where state in ('requested', 'approved', 'assigned');
create index enrollments_org_state_queue_idx on public.enrollments (organization_id, state, created_at) where state in ('requested', 'approved');
create index enrollments_learner_state_idx on public.enrollments (learner_id, state, updated_at desc);
create index enrollments_course_state_idx on public.enrollments (course_id, state, created_at desc);
create index enrollments_cohort_idx on public.enrollments (cohort_id, state) where cohort_id is not null;
create index enrollments_decided_by_idx on public.enrollments (decided_by) where decided_by is not null;

create table public.learning_paths (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  title jsonb not null check (jsonb_typeof(title) = 'object'),
  rule_version integer not null default 1 check (rule_version > 0),
  state public.record_state not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint learning_paths_org_code_unique unique (organization_id, code)
);

create index learning_paths_org_state_idx on public.learning_paths (organization_id, state, code);
create index learning_paths_created_by_idx on public.learning_paths (created_by) where created_by is not null;

create table public.learning_path_items (
  id uuid primary key default app_private.uuid7(),
  learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
  course_id uuid references public.courses(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete restrict,
  position integer not null check (position >= 0),
  condition_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(condition_rule) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint learning_path_items_one_target check ((course_id is not null)::integer + (task_id is not null)::integer = 1),
  constraint learning_path_items_path_position_unique unique (learning_path_id, position)
);

create index learning_path_items_course_idx on public.learning_path_items (course_id) where course_id is not null;
create index learning_path_items_task_idx on public.learning_path_items (task_id) where task_id is not null;

create table public.path_assignments (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learning_path_id uuid not null references public.learning_paths(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  rationale text not null,
  state public.record_state not null default 'active',
  override_reason text,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint path_assignments_rationale_not_blank check (length(btrim(rationale)) > 0)
);

create unique index path_assignments_live_uidx on public.path_assignments (learning_path_id, learner_id) where state = 'active';
create index path_assignments_learner_state_idx on public.path_assignments (learner_id, state, updated_at desc);
create index path_assignments_org_state_idx on public.path_assignments (organization_id, state, created_at desc);
create index path_assignments_assigned_by_idx on public.path_assignments (assigned_by) where assigned_by is not null;

-- Stable authorization vocabulary; codes, not UUIDs, are application contracts.
insert into public.roles (code, description) values
  ('learner', 'Learner with access to assigned learning resources'),
  ('trainer', 'Trainer scoped to assigned cohorts and reviews'),
  ('admin', 'Platform administrator'),
  ('organization_admin', 'Administrator scoped to one organization'),
  ('content_admin', 'Course author and publisher'),
  ('support', 'Operational support with redacted access'),
  ('integration_admin', 'Integration reconciliation operator'),
  ('dpo', 'Privacy request and retention operator')
on conflict (code) do nothing;

insert into public.permissions (code, description) values
  ('profile.read_self', 'Read own profile'),
  ('profile.update_self', 'Update own profile'),
  ('catalog.read', 'Read active catalog'),
  ('enrollment.request', 'Request own enrollment'),
  ('enrollment.decide', 'Decide enrollment requests'),
  ('cohort.read', 'Read assigned cohort'),
  ('cohort.manage', 'Manage cohort lifecycle and membership'),
  ('learning.submit', 'Submit own work'),
  ('review.manage', 'Review assigned learner work'),
  ('question.manage', 'Answer or transfer assigned questions'),
  ('content.manage', 'Create and update content'),
  ('content.publish', 'Publish immutable content versions'),
  ('organization.manage', 'Manage organization-scoped people and assignments'),
  ('audit.read', 'Read scoped audit events'),
  ('integration.replay', 'Reconcile and safely replay integrations'),
  ('privacy.manage', 'Process data subject requests'),
  ('support.manage', 'Manage operational support issues')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role_row.id, permission_row.id
from public.roles role_row
join public.permissions permission_row on (
  (role_row.code = 'learner' and permission_row.code in ('profile.read_self', 'profile.update_self', 'catalog.read', 'enrollment.request', 'cohort.read', 'learning.submit'))
  or (role_row.code = 'trainer' and permission_row.code in ('profile.read_self', 'profile.update_self', 'catalog.read', 'cohort.read', 'review.manage', 'question.manage'))
  or (role_row.code = 'admin')
  or (role_row.code = 'organization_admin' and permission_row.code in ('profile.read_self', 'profile.update_self', 'catalog.read', 'enrollment.decide', 'cohort.read', 'cohort.manage', 'organization.manage', 'audit.read'))
  or (role_row.code = 'content_admin' and permission_row.code in ('profile.read_self', 'catalog.read', 'content.manage', 'content.publish'))
  or (role_row.code = 'support' and permission_row.code in ('profile.read_self', 'support.manage'))
  or (role_row.code = 'integration_admin' and permission_row.code in ('profile.read_self', 'integration.replay'))
  or (role_row.code = 'dpo' and permission_row.code in ('profile.read_self', 'privacy.manage', 'audit.read'))
)
on conflict do nothing;

-- One trigger pattern for optimistic records.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'profiles', 'organization_memberships', 'courses',
    'content_versions', 'stages', 'tasks', 'cohorts', 'cohort_memberships',
    'task_schedules', 'enrollments', 'learning_paths', 'path_assignments'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.bump_row_version()',
      table_name || '_bump_row_version', table_name
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'course_localizations', 'stage_localizations', 'bug_categories', 'task_localizations', 'task_options'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

create or replace function app_private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), ''),
    case when new.raw_user_meta_data ->> 'locale' in ('en', 'de', 'ru') then new.raw_user_meta_data ->> 'locale' else 'en' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.create_profile_for_auth_user() from public, anon, authenticated;

create trigger auth_user_create_profile
after insert on auth.users
for each row execute function app_private.create_profile_for_auth_user();

