-- Deterministic local-only seed. Password for every seeded account:
-- Ditele-Local-2026! (never use these identities outside the local stack).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  seed.id,
  'authenticated',
  'authenticated',
  seed.email,
  extensions.crypt('Ditele-Local-2026!', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', seed.display_name, 'locale', seed.locale),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
from (values
  ('01980a00-0000-7000-8000-000000000001'::uuid, 'learner@ditele.local', 'Lena Learner', 'en'),
  ('01980a00-0000-7000-8000-000000000002'::uuid, 'trainer@ditele.local', 'Theo Trainer', 'de'),
  ('01980a00-0000-7000-8000-000000000003'::uuid, 'admin@ditele.local', 'Ada Admin', 'en'),
  ('01980a00-0000-7000-8000-000000000004'::uuid, 'org-admin@ditele.local', 'Olivia Organization Admin', 'ru')
) as seed(id, email, display_name, locale)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  user_row.id, user_row.id, user_row.email,
  jsonb_build_object('sub', user_row.id::text, 'email', user_row.email, 'email_verified', true),
  'email', statement_timestamp(), statement_timestamp(), statement_timestamp()
from auth.users user_row
where user_row.id in (
  '01980a00-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000002',
  '01980a00-0000-7000-8000-000000000003',
  '01980a00-0000-7000-8000-000000000004'
)
on conflict (provider_id, provider) do update
set identity_data = excluded.identity_data, updated_at = excluded.updated_at;

insert into public.user_roles (id, user_id, role_id, organization_id, reason)
select seed.id, seed.user_id, role_row.id, seed.organization_id, 'deterministic local development seed'
from (values
  ('01980a12-0000-7000-8000-000000000001'::uuid, '01980a00-0000-7000-8000-000000000001'::uuid, 'learner'::text, '01980a10-0000-7000-8000-000000000001'::uuid),
  ('01980a12-0000-7000-8000-000000000002'::uuid, '01980a00-0000-7000-8000-000000000002'::uuid, 'trainer'::text, '01980a10-0000-7000-8000-000000000001'::uuid),
  ('01980a12-0000-7000-8000-000000000003'::uuid, '01980a00-0000-7000-8000-000000000003'::uuid, 'admin'::text, null::uuid),
  ('01980a12-0000-7000-8000-000000000004'::uuid, '01980a00-0000-7000-8000-000000000003'::uuid, 'content_admin'::text, '01980a10-0000-7000-8000-000000000001'::uuid),
  ('01980a12-0000-7000-8000-000000000005'::uuid, '01980a00-0000-7000-8000-000000000004'::uuid, 'organization_admin'::text, '01980a10-0000-7000-8000-000000000001'::uuid)
) as seed(id, user_id, role_code, organization_id)
join public.roles role_row on role_row.code = seed.role_code
on conflict do nothing;

insert into public.courses (id, slug, state, default_locale, estimated_minutes, created_by)
values (
  '01980a20-0000-7000-8000-000000000001', 'practical-software-testing',
  'active', 'en', 480, '01980a00-0000-7000-8000-000000000003'
)
on conflict (id) do nothing;

insert into public.course_localizations (
  id, course_id, locale, title, summary, description_html, learning_outcomes
)
values
  ('01980a21-0000-7000-8000-000000000001', '01980a20-0000-7000-8000-000000000001', 'en', 'Practical Software Testing', 'Learn testing through evidence-based practice.', '<p>Practice test design, execution, evidence and review.</p>', '["Design effective tests"]'),
  ('01980a21-0000-7000-8000-000000000002', '01980a20-0000-7000-8000-000000000001', 'de', 'Praktisches Softwaretesten', 'Softwaretesten durch evidenzbasierte Praxis lernen.', '<p>Testentwurf, Ausführung, Evidenz und Review üben.</p>', '["Wirksame Tests entwerfen"]'),
  ('01980a21-0000-7000-8000-000000000003', '01980a20-0000-7000-8000-000000000001', 'ru', 'Практическое тестирование ПО', 'Практическое обучение тестированию.', '<p>Практика тест-дизайна и ревью.</p>', '["Проектировать тесты"]')
on conflict (course_id, locale) do nothing;

insert into public.content_versions (
  id, course_id, version_number, state, change_summary, snapshot, created_by
)
values (
  '01980a22-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001', 1, 'draft',
  'Initial seed course', '{}'::jsonb,
  '01980a00-0000-7000-8000-000000000003'
)
on conflict (course_id, version_number) do nothing;

insert into public.stages (id, course_id, content_version_id, position, state)
values (
  '01980a23-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001', 0, 'active'
)
on conflict (id) do nothing;

insert into public.stage_localizations (id, stage_id, locale, title, description_html)
values
  ('01980a24-0000-7000-8000-000000000001', '01980a23-0000-7000-8000-000000000001', 'en', 'Test analysis', '<p>Analyze a realistic target.</p>'),
  ('01980a24-0000-7000-8000-000000000002', '01980a23-0000-7000-8000-000000000001', 'de', 'Testanalyse', '<p>Analysiere ein realistisches Ziel.</p>'),
  ('01980a24-0000-7000-8000-000000000003', '01980a23-0000-7000-8000-000000000001', 'ru', 'Анализ', '<p>Проанализируйте цель.</p>')
on conflict (stage_id, locale) do nothing;

insert into public.bug_categories (id, code, labels, state)
values ('01980a25-0000-7000-8000-000000000001', 'functional', '{"en":"Functional","de":"Funktional","ru":"Функциональный"}', 'active')
on conflict (id) do nothing;

insert into public.tasks (
  id, course_id, stage_id, content_version_id, bug_category_id,
  position, task_kind, state, target_url, expected_minutes
)
values (
  '01980a26-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980a23-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  '01980a25-0000-7000-8000-000000000001',
  0, 'practical', 'active', 'https://example.invalid/testing-target', 45
)
on conflict (id) do nothing;

insert into public.task_localizations (
  id, task_id, locale, title, instructions_html, hint_text
)
values
  ('01980a27-0000-7000-8000-000000000001', '01980a26-0000-7000-8000-000000000001', 'en', 'Analyze the login flow', '<p>Design risk-based login tests.</p>', 'Start with equivalence partitions.'),
  ('01980a27-0000-7000-8000-000000000002', '01980a26-0000-7000-8000-000000000001', 'de', 'Login-Ablauf analysieren', '<p>Entwirf risikobasierte Login-Tests.</p>', 'Beginne mit Äquivalenzklassen.'),
  ('01980a27-0000-7000-8000-000000000003', '01980a26-0000-7000-8000-000000000001', 'ru', 'Анализ входа', '<p>Разработайте тесты входа.</p>', 'Начните с классов эквивалентности.')
on conflict (task_id, locale) do nothing;

insert into public.task_model_answers (task_localization_id, model_answer)
values
  ('01980a27-0000-7000-8000-000000000001', 'Trainer-only seed model answer.'),
  ('01980a27-0000-7000-8000-000000000002', 'Nur für Trainer sichtbare Musterantwort.'),
  ('01980a27-0000-7000-8000-000000000003', 'Эталонный ответ только для тренера.')
on conflict (task_localization_id) do nothing;

insert into public.task_options (id, task_id, option_key, labels, position)
values
  ('01980a28-0000-7000-8000-000000000001', '01980a26-0000-7000-8000-000000000001', 'boundary', '{"en":"Boundary analysis","de":"Grenzwertanalyse","ru":"Анализ границ"}', 0),
  ('01980a28-0000-7000-8000-000000000002', '01980a26-0000-7000-8000-000000000001', 'random', '{"en":"Random clicking","de":"Zufälliges Klicken","ru":"Случайные клики"}', 1)
on conflict (task_id, option_key) do nothing;

insert into public.task_option_answers (task_option_id, is_correct)
values
  ('01980a28-0000-7000-8000-000000000001', true),
  ('01980a28-0000-7000-8000-000000000002', false)
on conflict (task_option_id) do nothing;

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state, progression_mode,
  starts_at, capacity, created_by
)
values (
  '01980a30-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001', 'Release 0 Cohort',
  'waiting', 'scheduled', statement_timestamp() - interval '1 day', 25,
  '01980a00-0000-7000-8000-000000000003'
)
on conflict (id) do nothing;

insert into public.cohort_memberships (id, cohort_id, user_id, role, state, assigned_by)
values
  ('01980a31-0000-7000-8000-000000000001', '01980a30-0000-7000-8000-000000000001', '01980a00-0000-7000-8000-000000000001', 'learner', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980a31-0000-7000-8000-000000000002', '01980a30-0000-7000-8000-000000000001', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003')
on conflict do nothing;

insert into public.task_schedules (id, cohort_id, task_id, available_from, due_at, changed_by)
values (
  '01980a32-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  statement_timestamp() - interval '1 day', statement_timestamp() + interval '30 days',
  '01980a00-0000-7000-8000-000000000003'
)
on conflict (cohort_id, task_id) do nothing;

insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  idempotency_key, decided_by, decided_at
)
values (
  '01980a33-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001', 'assigned',
  'seed-enrollment-00000001', '01980a00-0000-7000-8000-000000000003',
  statement_timestamp()
)
on conflict (id) do nothing;

insert into public.attempts (
  id, organization_id, enrollment_id, learner_id, cohort_id, task_id, state
)
values (
  '01980a34-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a33-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001', 'in_progress'
)
on conflict (id) do nothing;

insert into public.attempt_drafts (attempt_id, answer_text, selected_option_ids)
values (
  '01980a34-0000-7000-8000-000000000001', 'Seed learner draft.',
  array['01980a28-0000-7000-8000-000000000001'::uuid]
)
on conflict (attempt_id) do nothing;

insert into public.product_packages (id, code, labels, capabilities, state)
values (
  '01980a40-0000-7000-8000-000000000001', 'academy-core',
  '{"en":"Academy Core","de":"Academy Basis","ru":"Academy Core"}',
  array['catalog', 'learning', 'questions', 'portfolio'], 'active'
)
on conflict (id) do nothing;

insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source
)
values
  ('01980a41-0000-7000-8000-000000000001', '01980a10-0000-7000-8000-000000000001', '01980a00-0000-7000-8000-000000000001', '01980a40-0000-7000-8000-000000000001', 'learning', 'manual'),
  ('01980a41-0000-7000-8000-000000000002', '01980a10-0000-7000-8000-000000000001', '01980a00-0000-7000-8000-000000000001', '01980a40-0000-7000-8000-000000000001', 'portfolio', 'manual')
on conflict do nothing;

insert into public.portfolios (id, organization_id, learner_id, title, summary)
values (
  '01980a42-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  'Lena Learner — QA Evidence', 'Verified practical software-testing evidence.'
)
on conflict (learner_id) do nothing;
