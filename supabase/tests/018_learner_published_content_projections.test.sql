begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'list_my_learning_courses',
        'get_my_learning_course',
        'get_my_learning_task'
      )
  ),
  3::bigint,
  'the learner publication boundary exposes exactly three public RPCs'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'list_my_learning_courses',
        'get_my_learning_course',
        'get_my_learning_task'
      )
      and procedure_record.prosecdef
      and procedure_record.provolatile = 's'
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  3::bigint,
  'all learner projection RPCs are stable security definers with an empty search path'
);

select is(
  (
    select pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.list_my_learning_courses(text)'::pg_catalog.regprocedure
  ),
  'p_locale text',
  'the dashboard RPC accepts only a locale and derives its learner actor'
);

select is(
  (
    select pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.get_my_learning_course(uuid,text)'::pg_catalog.regprocedure
  ),
  'p_course_id uuid, p_locale text',
  'the course RPC accepts no learner, cohort, enrollment, or version scope'
);

select is(
  (
    select pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.get_my_learning_task(uuid)'::pg_catalog.regprocedure
  ),
  'p_task_id uuid',
  'the task RPC accepts no caller-controlled learner or cohort scope'
);

select is(
  (
    select sum(procedure_record.pronargdefaults)::integer
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'list_my_learning_courses', 'get_my_learning_course'
      )
  ),
  2,
  'locale is the only defaulted input across list and course projections'
);

select ok(
  not has_function_privilege(
    'anon', 'public.list_my_learning_courses(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.get_my_learning_course(uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.get_my_learning_task(uuid)', 'EXECUTE'
  ),
  'anonymous sessions cannot execute learner projections'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.list_my_learning_courses(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.get_my_learning_course(uuid,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.get_my_learning_task(uuid)', 'EXECUTE'
  ),
  'authenticated sessions receive only the three projection entrypoints'
);

select ok(
  has_function_privilege(
    'service_role', 'public.list_my_learning_courses(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_my_learning_course(uuid,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_my_learning_task(uuid)', 'EXECUTE'
  ),
  'trusted server operations retain the typed learner projection contracts'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.is_valid_learner_content_snapshot(jsonb,uuid,text,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.current_actor_pinned_course_context(uuid)',
    'EXECUTE'
  ),
  'snapshot validation and actor context helpers remain private'
);

create function pg_temp.learner_task_fixture(
  p_task_id uuid,
  p_position integer,
  p_title text
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_task_id,
    'position', p_position,
    'task_kind', 'practical',
    'target_url', 'https://lab.example.test/' || p_task_id::text,
    'expected_minutes', 45,
    'hint_penalty_basis_points', 0,
    'model_answer', 'never expose this trainer-only answer',
    'bug_category', jsonb_build_object(
      'code', 'internal-category',
      'labels', jsonb_build_object('en', 'Internal')
    ),
    'localizations', jsonb_build_array(
      jsonb_build_object(
        'locale', 'en', 'title', p_title || ' EN',
        'instructions_html', '<p>' || p_title || ' instructions EN</p>',
        'hint_text', 'legacy internal hint EN'
      ),
      jsonb_build_object(
        'locale', 'de', 'title', p_title || ' DE',
        'instructions_html', '<p>' || p_title || ' Anweisungen DE</p>',
        'hint_text', 'legacy internal hint DE'
      ),
      jsonb_build_object(
        'locale', 'ru', 'title', p_title || ' RU',
        'instructions_html', '<p>' || p_title || ' инструкции RU</p>',
        'hint_text', 'legacy internal hint RU'
      )
    ),
    'options', jsonb_build_array(
      jsonb_build_object(
        'id', app_private.uuid7(),
        'option_key', 'internal-correct-key',
        'labels', jsonb_build_object(
          'en', 'Boundary EN', 'de', 'Grenze DE', 'ru', 'Граница RU'
        ),
        'position', 0,
        'is_correct', true
      ),
      jsonb_build_object(
        'id', app_private.uuid7(),
        'option_key', 'internal-wrong-key',
        'labels', jsonb_build_object(
          'en', 'Random EN', 'de', 'Zufall DE', 'ru', 'Случайно RU'
        ),
        'position', 1,
        'is_correct', false
      )
    ),
    'assessment', jsonb_build_object(
      'question_translations', jsonb_build_object(
        'en', p_title || ' question EN',
        'de', p_title || ' Frage DE',
        'ru', p_title || ' вопрос RU'
      ),
      'selection_mode', 'single',
      'minimum_selections', 1,
      'maximum_selections', 1,
      'correct_option_ids', jsonb_build_array('internal')
    ),
    'hints', jsonb_build_array(
      jsonb_build_object(
        'id', app_private.uuid7(),
        'position', 0,
        'content_translations', jsonb_build_object(
          'en', p_title || ' hint EN',
          'de', p_title || ' Hinweis DE',
          'ru', p_title || ' подсказка RU'
        )
      )
    ),
    'rubric', jsonb_build_object(
      'code', 'trainer-only-rubric',
      'criteria', jsonb_build_array(jsonb_build_object('secret', true))
    ),
    'skill_mappings', jsonb_build_array(
      jsonb_build_object('internal_skill_id', app_private.uuid7())
    ),
    -- Explicit prerequisite payloads are now validated fail-closed. These
    -- projection fixtures intentionally have no prerequisites; malformed
    -- prerequisite boundaries are covered by 022.
    'prerequisites', '[]'::jsonb
  );
$$;

create function pg_temp.learner_snapshot_fixture(
  p_course_id uuid,
  p_slug text,
  p_content_version_id uuid,
  p_version_number integer,
  p_stage_id uuid,
  p_title text,
  p_tasks jsonb,
  p_default_locale text default 'en'
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'course', jsonb_build_object(
      'id', p_course_id,
      'slug', p_slug,
      'default_locale', p_default_locale,
      'estimated_minutes', 360,
      'localizations', jsonb_build_array(
        jsonb_build_object(
          'locale', 'en', 'title', p_title || ' EN',
          'summary', p_title || ' summary EN',
          'description_html', '<p>' || p_title || ' description EN</p>',
          'learning_outcomes', jsonb_build_array('Outcome EN')
        ),
        jsonb_build_object(
          'locale', 'de', 'title', p_title || ' DE',
          'summary', p_title || ' Zusammenfassung DE',
          'description_html', '<p>' || p_title || ' Beschreibung DE</p>',
          'learning_outcomes', jsonb_build_array('Ergebnis DE')
        ),
        jsonb_build_object(
          'locale', 'ru', 'title', p_title || ' RU',
          'summary', p_title || ' описание RU',
          'description_html', '<p>' || p_title || ' описание RU</p>',
          'learning_outcomes', jsonb_build_array('Результат RU')
        )
      ),
      'media', jsonb_build_array(jsonb_build_object(
        'id', app_private.uuid7(),
        'object_key', 'private/course-video.mp4',
        'media_kind', 'video'
      ))
    ),
    'content_version', jsonb_build_object(
      'id', p_content_version_id,
      'version_number', p_version_number,
      'change_summary', 'fixture',
      'internal_release_note', 'never expose'
    ),
    'stages', jsonb_build_array(jsonb_build_object(
      'id', p_stage_id,
      'position', 0,
      'localizations', jsonb_build_array(
        jsonb_build_object(
          'locale', 'en', 'title', 'Stage EN',
          'description_html', '<p>Stage description EN</p>'
        ),
        jsonb_build_object(
          'locale', 'de', 'title', 'Stufe DE',
          'description_html', '<p>Stufenbeschreibung DE</p>'
        ),
        jsonb_build_object(
          'locale', 'ru', 'title', 'Этап RU',
          'description_html', '<p>Описание этапа RU</p>'
        )
      ),
      'media', jsonb_build_array(jsonb_build_object(
        'id', app_private.uuid7(),
        'object_key', 'private/stage-video.mp4',
        'media_kind', 'video'
      )),
      'tasks', p_tasks
    ))
  );
$$;

select ok(
  (
    select app_private.is_valid_learner_content_snapshot(
      version_record.snapshot,
      version_record.course_id,
      course_record.slug,
      version_record.id,
      version_record.version_number
    )
    from public.content_versions version_record
    join public.courses course_record
      on course_record.id = version_record.course_id
    where version_record.id = '01980a22-0000-7000-8000-000000000001'
  ),
  'the deterministic seed snapshot satisfies the strict learner validator'
);

select ok(
  not app_private.is_valid_learner_content_snapshot(
    '{"schema_version":1,"course":{},"content_version":{},"stages":[]}'::jsonb,
    '01980e20-0000-7000-8000-000000000099',
    'malformed-learner-content',
    '01980e22-0000-7000-8000-000000000099',
    1
  ),
  'malformed or incomplete learner snapshots fail closed'
);

insert into public.organizations (id, slug, name, state)
values (
  '01980e10-0000-7000-8000-000000000002',
  'learner-projection-other-tenant',
  'Learner Projection Other Tenant',
  'active'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', fixture.user_id,
  'authenticated', 'authenticated', fixture.email,
  extensions.crypt('Ditele-Local-2026!', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"],"seed_fixture":"true"}'::jsonb,
  jsonb_build_object(
    'display_name', fixture.display_name,
    'locale', fixture.locale
  ),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
from (values
  (
    '01980e00-0000-7000-8000-000000000001'::uuid,
    'learner-two@projection.test', 'Learner Two', 'de'
  ),
  (
    '01980e00-0000-7000-8000-000000000002'::uuid,
    'other-tenant@projection.test', 'Other Tenant Learner', 'ru'
  )
) as fixture(user_id, email, display_name, locale);

insert into public.organization_memberships (
  organization_id, user_id, state, joined_at
)
values
  (
    '01980a10-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    'active', statement_timestamp()
  ),
  (
    '01980e10-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000002',
    'active', statement_timestamp()
  );

insert into public.user_roles (
  user_id, role_id, organization_id, reason
)
select fixture.user_id, role_record.id, fixture.organization_id,
  'learner projection fixture'
from (values
  (
    '01980e00-0000-7000-8000-000000000001'::uuid,
    '01980a10-0000-7000-8000-000000000001'::uuid
  ),
  (
    '01980e00-0000-7000-8000-000000000002'::uuid,
    '01980e10-0000-7000-8000-000000000002'::uuid
  )
) fixture(user_id, organization_id)
cross join public.roles role_record
where role_record.code = 'learner';

insert into public.enrollments (
  id, organization_id, learner_id, course_id, state, idempotency_key
)
values (
  '01980e33-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980e00-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  'requested', 'learner-preview-before-publication-0001'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  (
    select course_record.title
    from public.list_my_learning_courses('de') course_record
    where course_record.enrollment_id =
      '01980e33-0000-7000-8000-000000000001'
  ),
  'Praktisches Softwaretesten',
  'a learner-owned request initially previews the latest validated publication'
);

select is(
  (
    select course_record.content_version_id
    from public.list_my_learning_courses('de') course_record
    where course_record.enrollment_id =
      '01980e33-0000-7000-8000-000000000001'
  ),
  null::uuid,
  'a requested preview is explicitly unpinned and non-actionable'
);

reset role;
-- Return fixture setup to an unclaimed trusted database session. Published
-- graph bootstrap is intentionally available only to the migration/seed owner
-- when no application actor is present.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into public.courses (
  id, organization_id, slug, state, default_locale, estimated_minutes,
  created_by
)
values
  (
    '01980e20-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    'projection-scheduled', 'active', 'en', 360,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e20-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    'projection-completed', 'active', 'en', 360,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e20-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    'projection-pending-private', 'active', 'en', 360,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e20-0000-7000-8000-000000000004',
    '01980e10-0000-7000-8000-000000000002',
    'projection-cross-tenant', 'active', 'en', 360,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e20-0000-7000-8000-000000000005',
    '01980a10-0000-7000-8000-000000000001',
    'projection-flexible', 'active', 'en', 360,
    '01980a00-0000-7000-8000-000000000003'
  );

-- A later global publication is safe for pending preview only. The seeded
-- learner's already-assigned cohort must remain pinned to version 1.
insert into public.content_versions (
  id, course_id, version_number, state, change_summary, snapshot,
  created_by, published_by, published_at
)
values (
  '01980e22-0000-7000-8000-000000000009',
  '01980a20-0000-7000-8000-000000000001', 2, 'published',
  'later seed publication used to prove exact pins',
  pg_temp.learner_snapshot_fixture(
    '01980a20-0000-7000-8000-000000000001',
    'practical-software-testing',
    '01980e22-0000-7000-8000-000000000009', 2,
    '01980e23-0000-7000-8000-000000000009',
    'Seed Latest',
    jsonb_build_array(pg_temp.learner_task_fixture(
      '01980e26-0000-7000-8000-000000000009', 0, 'Seed Latest Task'
    ))
  ),
  '01980a00-0000-7000-8000-000000000003',
  '01980a00-0000-7000-8000-000000000003',
  statement_timestamp()
);

insert into public.content_versions (
  id, course_id, version_number, state, change_summary, snapshot,
  created_by, published_by, published_at, archived_by, archived_at,
  archive_reason, archive_impact_fingerprint
)
values
  (
    '01980e22-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000001', 1, 'draft',
    'scheduled projection fixture',
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000001',
      'projection-scheduled',
      '01980e22-0000-7000-8000-000000000001', 1,
      '01980e23-0000-7000-8000-000000000001',
      'Scheduled Boundary',
      jsonb_build_array(
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000001', 0, 'Revision First'
        ),
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000002', 1, 'Future Locked'
        ),
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000003', 2, 'Currently Available'
        ),
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000004', 3, 'Submitted Past Due'
        ),
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000005', 4, 'Resubmitted Past Due'
        ),
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000006', 5, 'Accepted Past Due'
        )
      )
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp(), null, null, null, null
  ),
  (
    '01980e22-0000-7000-8000-000000000002',
    '01980e20-0000-7000-8000-000000000002', 1, 'draft',
    'completed history fixture',
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000002',
      'projection-completed',
      '01980e22-0000-7000-8000-000000000002', 1,
      '01980e23-0000-7000-8000-000000000002',
      'Archived History',
      jsonb_build_array(
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000007', 0,
          'Archived Revision Task'
        ),
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-00000000000c', 1,
          'Archived Accepted Task'
        )
      )
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '2 days',
    null, null, null, null
  ),
  (
    '01980e22-0000-7000-8000-000000000003',
    '01980e20-0000-7000-8000-000000000003', 1, 'published',
    'same-tenant pending fixture',
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000003',
      'projection-pending-private',
      '01980e22-0000-7000-8000-000000000003', 1,
      '01980e23-0000-7000-8000-000000000003',
      'Tenant Pending',
      jsonb_build_array(pg_temp.learner_task_fixture(
        '01980e26-0000-7000-8000-000000000008', 0, 'Tenant Pending Task'
      ))
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp(), null, null, null, null
  ),
  (
    '01980e22-0000-7000-8000-000000000004',
    '01980e20-0000-7000-8000-000000000004', 1, 'published',
    'cross-tenant pending fixture',
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000004',
      'projection-cross-tenant',
      '01980e22-0000-7000-8000-000000000004', 1,
      '01980e23-0000-7000-8000-000000000004',
      'Other Tenant Pending',
      jsonb_build_array(pg_temp.learner_task_fixture(
        '01980e26-0000-7000-8000-00000000000a', 0,
        'Other Tenant Pending Task'
      ))
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp(), null, null, null, null
  ),
  (
    '01980e22-0000-7000-8000-000000000005',
    '01980e20-0000-7000-8000-000000000005', 1, 'draft',
    'flexible projection fixture',
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000005',
      'projection-flexible',
      '01980e22-0000-7000-8000-000000000005', 1,
      '01980e23-0000-7000-8000-000000000005',
      'Flexible Boundary',
      jsonb_build_array(pg_temp.learner_task_fixture(
        '01980e26-0000-7000-8000-00000000000b', 0, 'Flexible Task'
      ))
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp(), null, null, null, null
  );

-- Only scheduled/flexible fixtures need normalized task identities for
-- schedules and attempts. Learner content itself is always read from the
-- immutable publication snapshot above.
insert into public.stages (
  id, course_id, content_version_id, position, state
)
values
  (
    '01980e23-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001', 0, 'active'
  ),
  (
    '01980e23-0000-7000-8000-000000000005',
    '01980e20-0000-7000-8000-000000000005',
    '01980e22-0000-7000-8000-000000000005', 0, 'active'
  ),
  (
    '01980e23-0000-7000-8000-000000000002',
    '01980e20-0000-7000-8000-000000000002',
    '01980e22-0000-7000-8000-000000000002', 0, 'active'
  );

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind, state,
  target_url, expected_minutes
)
values
  (
    '01980e26-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000001',
    '01980e23-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001', 0, 'practical', 'active',
    'https://lab.example.test/revision', 45
  ),
  (
    '01980e26-0000-7000-8000-000000000002',
    '01980e20-0000-7000-8000-000000000001',
    '01980e23-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001', 1, 'practical', 'active',
    'https://lab.example.test/future', 45
  ),
  (
    '01980e26-0000-7000-8000-000000000003',
    '01980e20-0000-7000-8000-000000000001',
    '01980e23-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001', 2, 'practical', 'active',
    'https://lab.example.test/current', 45
  ),
  (
    '01980e26-0000-7000-8000-000000000004',
    '01980e20-0000-7000-8000-000000000001',
    '01980e23-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001', 3, 'practical', 'active',
    'https://lab.example.test/submitted', 45
  ),
  (
    '01980e26-0000-7000-8000-000000000005',
    '01980e20-0000-7000-8000-000000000001',
    '01980e23-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001', 4, 'practical', 'active',
    'https://lab.example.test/resubmitted', 45
  ),
  (
    '01980e26-0000-7000-8000-000000000006',
    '01980e20-0000-7000-8000-000000000001',
    '01980e23-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001', 5, 'practical', 'active',
    'https://lab.example.test/accepted', 45
  ),
  (
    '01980e26-0000-7000-8000-00000000000b',
    '01980e20-0000-7000-8000-000000000005',
    '01980e23-0000-7000-8000-000000000005',
    '01980e22-0000-7000-8000-000000000005', 0, 'practical', 'active',
    'https://lab.example.test/flexible', 45
  ),
  (
    '01980e26-0000-7000-8000-000000000007',
    '01980e20-0000-7000-8000-000000000002',
    '01980e23-0000-7000-8000-000000000002',
    '01980e22-0000-7000-8000-000000000002', 0, 'practical', 'active',
    'https://lab.example.test/archived-revision', 45
  ),
  (
    '01980e26-0000-7000-8000-00000000000c',
    '01980e20-0000-7000-8000-000000000002',
    '01980e23-0000-7000-8000-000000000002',
    '01980e22-0000-7000-8000-000000000002', 1, 'practical', 'active',
    'https://lab.example.test/archived-accepted', 45
  );

-- Normalize fixture identities while their graphs are mutable, then move the
-- exact stored snapshots through the database-owner lifecycle path. Production
-- graph triggers no longer contain an auth-null post-publication exception.
update public.content_versions
set state = 'in_review'
where id in (
  '01980e22-0000-7000-8000-000000000001',
  '01980e22-0000-7000-8000-000000000002',
  '01980e22-0000-7000-8000-000000000005'
);

update public.content_versions
set state = 'published'
where id in (
  '01980e22-0000-7000-8000-000000000001',
  '01980e22-0000-7000-8000-000000000002',
  '01980e22-0000-7000-8000-000000000005'
);

-- Archive only after the trusted normalized identity bootstrap. The immutable
-- snapshot and graph remain byte-for-byte stable across this terminal change.
update public.content_versions
set state = 'archived',
    archived_by = '01980a00-0000-7000-8000-000000000003',
    archived_at = statement_timestamp() - interval '1 day',
    archive_reason = 'superseded after cohort completion',
    archive_impact_fingerprint = repeat('a', 64)
where id = '01980e22-0000-7000-8000-000000000002';

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, starts_at, completed_at, created_by
)
values
  (
    '01980e30-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000001',
    '01980e22-0000-7000-8000-000000000001',
    'Projection Scheduled Cohort', 'active', 'scheduled',
    statement_timestamp() - interval '10 days', null,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e30-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000002',
    '01980e22-0000-7000-8000-000000000002',
    'Projection Completed Cohort', 'completed', 'scheduled',
    statement_timestamp() - interval '20 days',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e30-0000-7000-8000-000000000005',
    '01980a10-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000005',
    '01980e22-0000-7000-8000-000000000005',
    'Projection Flexible Cohort', 'active', 'flexible',
    statement_timestamp() - interval '5 days', null,
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
)
values
  (
    '01980e31-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e31-0000-7000-8000-000000000002',
    '01980e30-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000001',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980e31-0000-7000-8000-000000000005',
    '01980e30-0000-7000-8000-000000000005',
    '01980e00-0000-7000-8000-000000000001',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  );

insert into public.task_schedules (
  id, cohort_id, task_id, available_from, due_at, changed_by,
  change_reason
)
values
  (
    '01980e32-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000001',
    statement_timestamp() - interval '10 days',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003', 'past revision window'
  ),
  (
    '01980e32-0000-7000-8000-000000000002',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000002',
    statement_timestamp() + interval '1 day',
    statement_timestamp() + interval '10 days',
    '01980a00-0000-7000-8000-000000000003', 'future task window'
  ),
  (
    '01980e32-0000-7000-8000-000000000003',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day',
    statement_timestamp() + interval '10 days',
    '01980a00-0000-7000-8000-000000000003', 'currently available window'
  ),
  (
    '01980e32-0000-7000-8000-000000000004',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000004',
    statement_timestamp() - interval '10 days',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003', 'past submitted window'
  ),
  (
    '01980e32-0000-7000-8000-000000000005',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000005',
    statement_timestamp() - interval '10 days',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003', 'past resubmitted window'
  ),
  (
    '01980e32-0000-7000-8000-000000000006',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000006',
    statement_timestamp() - interval '10 days',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003', 'past accepted window'
  );

insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  idempotency_key, decided_by, decided_at, completed_at
)
values
  (
    '01980e33-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001', 'assigned',
    'projection-scheduled-enrollment-0002',
    '01980a00-0000-7000-8000-000000000003', statement_timestamp(), null
  ),
  (
    '01980e33-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000002',
    '01980e30-0000-7000-8000-000000000002', 'completed',
    'projection-completed-enrollment-0003',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '1 day'
  ),
  (
    '01980e33-0000-7000-8000-000000000004',
    '01980a10-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000003', null, 'approved',
    'projection-private-request-0004',
    '01980a00-0000-7000-8000-000000000003', statement_timestamp(), null
  ),
  (
    '01980e33-0000-7000-8000-000000000005',
    '01980e10-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000004', null, 'requested',
    'projection-cross-tenant-leak-0005', null, null, null
  ),
  (
    '01980e33-0000-7000-8000-000000000006',
    '01980e10-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000002',
    '01980e20-0000-7000-8000-000000000004', null, 'requested',
    'projection-other-tenant-owner-0006', null, null, null
  ),
  (
    '01980e33-0000-7000-8000-000000000007',
    '01980a10-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000005',
    '01980e30-0000-7000-8000-000000000005', 'assigned',
    'projection-flexible-enrollment-0007',
    '01980a00-0000-7000-8000-000000000003', statement_timestamp(), null
  ),
  -- Mismatched terminal pairs are deliberate fixtures. They must never be
  -- synthesized into canonical learner history by this read boundary.
  (
    '01980e33-0000-7000-8000-000000000008',
    '01980a10-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001', 'completed',
    'projection-mismatch-completed-active-0008',
    '01980a00-0000-7000-8000-000000000003', statement_timestamp(),
    statement_timestamp()
  ),
  (
    '01980e33-0000-7000-8000-000000000009',
    '01980a10-0000-7000-8000-000000000001',
    '01980e00-0000-7000-8000-000000000001',
    '01980e20-0000-7000-8000-000000000002',
    '01980e30-0000-7000-8000-000000000002', 'assigned',
    'projection-mismatch-assigned-done-0009',
    '01980a00-0000-7000-8000-000000000003', statement_timestamp(), null
  );

insert into public.attempts (
  id, organization_id, enrollment_id, learner_id, cohort_id, task_id,
  state, started_at, last_activity_at, submitted_at, accepted_at
)
values
  (
    '01980e34-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980e33-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000001', 'revision_required',
    statement_timestamp() - interval '5 days',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '2 days', null
  ),
  (
    '01980e34-0000-7000-8000-000000000004',
    '01980a10-0000-7000-8000-000000000001',
    '01980e33-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000004', 'submitted',
    statement_timestamp() - interval '5 days',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '2 days', null
  ),
  (
    '01980e34-0000-7000-8000-000000000005',
    '01980a10-0000-7000-8000-000000000001',
    '01980e33-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000005', 'resubmitted',
    statement_timestamp() - interval '5 days',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '2 days', null
  ),
  (
    '01980e34-0000-7000-8000-000000000006',
    '01980a10-0000-7000-8000-000000000001',
    '01980e33-0000-7000-8000-000000000002',
    '01980e00-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000001',
    '01980e26-0000-7000-8000-000000000006', 'accepted',
    statement_timestamp() - interval '5 days',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '1 day'
  ),
  (
    '01980e34-0000-7000-8000-000000000007',
    '01980a10-0000-7000-8000-000000000001',
    '01980e33-0000-7000-8000-000000000003',
    '01980e00-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000002',
    '01980e26-0000-7000-8000-000000000007', 'revision_required',
    statement_timestamp() - interval '5 days',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '2 days', null
  ),
  (
    '01980e34-0000-7000-8000-00000000000c',
    '01980a10-0000-7000-8000-000000000001',
    '01980e33-0000-7000-8000-000000000003',
    '01980e00-0000-7000-8000-000000000001',
    '01980e30-0000-7000-8000-000000000002',
    '01980e26-0000-7000-8000-00000000000c', 'accepted',
    statement_timestamp() - interval '5 days',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '1 day'
  );

-- Cross-cohort progress contamination is rejected at the write boundary. The
-- actor and enrollment below match the scheduled pin, but the supplied cohort
-- does not; this corrupt legacy shape can no longer enter projection data.
select throws_ok(
  $$
    insert into public.attempts (
      id, organization_id, enrollment_id, learner_id, cohort_id, task_id,
      state, started_at, last_activity_at, submitted_at, accepted_at
    ) values (
      '01980e34-0000-7000-8000-00000000000d',
      '01980a10-0000-7000-8000-000000000001',
      '01980e33-0000-7000-8000-000000000002',
      '01980e00-0000-7000-8000-000000000001',
      '01980e30-0000-7000-8000-000000000005',
      '01980e26-0000-7000-8000-000000000002', 'accepted',
      statement_timestamp() - interval '5 days',
      statement_timestamp() - interval '1 day',
      statement_timestamp() - interval '2 days',
      statement_timestamp() - interval '1 day'
    )
  $$,
  '23514',
  'attempt delivery context is invalid',
  'cross-cohort attempt contamination is rejected before projection reads'
);

insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source
)
values (
  '01980e41-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980e00-0000-7000-8000-000000000001',
  '01980a40-0000-7000-8000-000000000001', 'learning', 'manual'
);

select ok(
  not app_private.is_valid_learner_content_snapshot(
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000099',
      'incomplete-localization',
      '01980e22-0000-7000-8000-000000000099', 1,
      '01980e23-0000-7000-8000-000000000099',
      'Incomplete localization',
      jsonb_build_array(
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000099', 0, 'Incomplete'
        ) #- '{localizations,2}'
      )
    ),
    '01980e20-0000-7000-8000-000000000099',
    'incomplete-localization',
    '01980e22-0000-7000-8000-000000000099', 1
  ),
  'a snapshot missing any EN, DE, or RU task localization fails closed'
);

select ok(
  not app_private.is_valid_learner_content_snapshot(
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000097',
      'markup-only-instructions',
      '01980e22-0000-7000-8000-000000000097', 1,
      '01980e23-0000-7000-8000-000000000097',
      'Markup-only instructions',
      jsonb_build_array(jsonb_set(
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000097', 0, 'Markup Only'
        ),
        '{localizations,0,instructions_html}',
        to_jsonb('<p></p>'::text)
      ))
    ),
    '01980e20-0000-7000-8000-000000000097',
    'markup-only-instructions',
    '01980e22-0000-7000-8000-000000000097', 1
  ),
  'markup-only instructions fail before the sanitized runtime DTO boundary'
);

select ok(
  not app_private.is_valid_learner_content_snapshot(
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000096',
      'oversized-option-position',
      '01980e22-0000-7000-8000-000000000096', 1,
      '01980e23-0000-7000-8000-000000000096',
      'Oversized option position',
      jsonb_build_array(jsonb_set(
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000096', 0, 'Option Overflow'
        ),
        '{options,0,position}', '2147483648'::jsonb
      ))
    ),
    '01980e20-0000-7000-8000-000000000096',
    'oversized-option-position',
    '01980e22-0000-7000-8000-000000000096', 1
  ),
  'oversized option ordering fails validation before projection integer casts'
);

select ok(
  not app_private.is_valid_learner_content_snapshot(
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000095',
      'oversized-hint-position',
      '01980e22-0000-7000-8000-000000000095', 1,
      '01980e23-0000-7000-8000-000000000095',
      'Oversized hint position',
      jsonb_build_array(jsonb_set(
        pg_temp.learner_task_fixture(
          '01980e26-0000-7000-8000-000000000095', 0, 'Hint Overflow'
        ),
        '{hints,0,position}', '2147483648'::jsonb
      ))
    ),
    '01980e20-0000-7000-8000-000000000095',
    'oversized-hint-position',
    '01980e22-0000-7000-8000-000000000095', 1
  ),
  'oversized hint ordering fails validation before projection integer casts'
);

select ok(
  not app_private.is_valid_learner_content_snapshot(
    pg_temp.learner_snapshot_fixture(
      '01980e20-0000-7000-8000-000000000099',
      'identity-mismatch',
      '01980e22-0000-7000-8000-000000000099', 1,
      '01980e23-0000-7000-8000-000000000099',
      'Identity mismatch',
      jsonb_build_array(pg_temp.learner_task_fixture(
        '01980e26-0000-7000-8000-000000000099', 0, 'Mismatch'
      ))
    ),
    '01980e20-0000-7000-8000-000000000098',
    'identity-mismatch',
    '01980e22-0000-7000-8000-000000000099', 1
  ),
  'snapshot identity must match the live course and content-version row'
);

-- An executable authenticated role with no subject still receives no data.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*) from public.list_my_learning_courses('en')),
  0::bigint,
  'an authenticated role without an actor receives no learner dashboard rows'
);

select is(
  public.get_my_learning_course(
    '01980a20-0000-7000-8000-000000000001', 'en'
  ),
  null::jsonb,
  'an authenticated role without an actor receives no course projection'
);

select is(
  public.get_my_learning_task(
    '01980a26-0000-7000-8000-000000000001'
  ),
  null::jsonb,
  'an authenticated role without an actor receives no task projection'
);

-- A real non-learner actor cannot reuse the entrypoints as generic reads.
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (select count(*) from public.list_my_learning_courses('en')),
  0::bigint,
  'a trainer cannot read learner dashboard projections'
);

select is(
  public.get_my_learning_course(
    '01980a20-0000-7000-8000-000000000001', 'en'
  ),
  null::jsonb,
  'a trainer cannot read a learner course projection'
);

select is(
  public.get_my_learning_task(
    '01980a26-0000-7000-8000-000000000001'
  ),
  null::jsonb,
  'a trainer cannot read a learner task projection'
);

-- Seed learner L1 proves that a later publication never moves an existing
-- cohort pin or changes its task identity.
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select is(
  (
    select course_record.content_version_id
    from public.list_my_learning_courses('en') course_record
    where course_record.enrollment_id =
      '01980a33-0000-7000-8000-000000000001'
  ),
  '01980a22-0000-7000-8000-000000000001'::uuid,
  'an assigned learner remains pinned to the cohort publication after v2 appears'
);

select is(
  (
    select course_record.title
    from public.list_my_learning_courses('de') course_record
    where course_record.enrollment_id =
      '01980a33-0000-7000-8000-000000000001'
  ),
  'Praktisches Softwaretesten',
  'the exact assigned snapshot resolves the requested DE localization'
);

select is(
  (
    select course_record.title
    from public.list_my_learning_courses('not-a-locale') course_record
    where course_record.enrollment_id =
      '01980a33-0000-7000-8000-000000000001'
  ),
  'Practical Software Testing',
  'an unsupported locale deterministically falls back to EN'
);

select results_eq(
  $$
    select next_task_id, next_task_state
    from public.list_my_learning_courses('en')
    where enrollment_id = '01980a33-0000-7000-8000-000000000001'
  $$,
  $$ values (
    '01980a26-0000-7000-8000-000000000001'::uuid,
    'in_progress'::text
  ) $$,
  'the assigned dashboard exposes only the actor-owned pinned next task'
);

select results_eq(
  $$
    select
      projection ->> 'title',
      projection ->> 'content_version_id',
      projection ->> 'version_number'
    from (select public.get_my_learning_course(
      '01980a20-0000-7000-8000-000000000001', 'ru'
    ) projection) course_projection
  $$,
  $$ values (
    'Практическое тестирование ПО'::text,
    '01980a22-0000-7000-8000-000000000001'::text,
    '1'::text
  ) $$,
  'the course workspace is localized and pinned to the exact seeded version'
);

select ok(
  public.get_my_learning_course(
    '01980a20-0000-7000-8000-000000000001', 'en'
  )::text !~* (
    'model_answer|is_correct|correct_option_ids|rubric|object_key|option_key|'
    || 'skill_mappings|prerequisites|internal_'
  ),
  'course projection JSON contains none of the hidden authoring or storage keys'
);

select is(
  (
    select count(*)
    from jsonb_object_keys(public.get_my_learning_course(
      '01980a20-0000-7000-8000-000000000001', 'en'
    ))
  ),
  15::bigint,
  'the course projection has an exact allowlisted top-level shape'
);

select ok(
  public.get_my_learning_task(
    '01980a26-0000-7000-8000-000000000001'
  )::text !~* (
    'model_answer|is_correct|correct_option_ids|rubric|object_key|option_key|'
    || 'skill_mappings|prerequisites|internal_'
  ),
  'task projection JSON contains none of the answer, rubric, skill, or storage keys'
);

select is(
  (
    select count(*)
    from jsonb_object_keys(public.get_my_learning_task(
      '01980a26-0000-7000-8000-000000000001'
    ))
  ),
  16::bigint,
  'the task projection has an exact allowlisted top-level shape'
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000001', 'en'
  ),
  null::jsonb,
  'learner L1 cannot read learner L2 course scope'
);

select is(
  public.get_my_learning_task(
    '01980e26-0000-7000-8000-000000000001'
  ),
  null::jsonb,
  'learner L1 cannot read learner L2 task scope'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  (select count(*) from public.list_my_learning_courses('de')),
  5::bigint,
  'learner L2 receives three canonical pins and two eligible pending rows'
);

select results_eq(
  $$
    select title, content_version_id, next_task_id
    from public.list_my_learning_courses('de')
    where enrollment_id = '01980e33-0000-7000-8000-000000000001'
  $$,
  $$ values ('Seed Latest DE'::text, null::uuid, null::uuid) $$,
  'a pending request previews the later validated publication without becoming pinned or actionable'
);

select results_eq(
  $$
    select enrollment_id
    from public.list_my_learning_courses('en')
    where enrollment_id in (
      '01980e33-0000-7000-8000-000000000004',
      '01980e33-0000-7000-8000-000000000005',
      '01980e33-0000-7000-8000-000000000008',
      '01980e33-0000-7000-8000-000000000009'
    )
    order by enrollment_id
  $$,
  $$ values ('01980e33-0000-7000-8000-000000000004'::uuid) $$,
  'same-tenant request is visible while cross-tenant and noncanonical state pairs are excluded'
);

select results_eq(
  $$
    select
      content_version_id,
      version_number,
      completed_activities,
      total_activities,
      next_task_id,
      next_task_state
    from public.list_my_learning_courses('en')
    where enrollment_id = '01980e33-0000-7000-8000-000000000002'
  $$,
  $$ values (
    '01980e22-0000-7000-8000-000000000001'::uuid,
    1::integer,
    1::bigint,
    6::bigint,
    '01980e26-0000-7000-8000-000000000001'::uuid,
    'revision_required'::text
  ) $$,
  'scheduled dashboard progress and next action derive from the exact pin and latest actor-owned attempts'
);

select results_eq(
  $$
    select activity.value ->> 'id', activity.value ->> 'state'
    from jsonb_array_elements(
      public.get_my_learning_course(
        '01980e20-0000-7000-8000-000000000001', 'de'
      ) #> '{stages,0,activities}'
    ) with ordinality activity(value, position)
    order by activity.position
  $$,
  $$ values
    ('01980e26-0000-7000-8000-000000000001'::text, 'revision_required'::text),
    ('01980e26-0000-7000-8000-000000000002'::text, 'locked'::text),
    ('01980e26-0000-7000-8000-000000000003'::text, 'available'::text),
    ('01980e26-0000-7000-8000-000000000004'::text, 'submitted'::text),
    ('01980e26-0000-7000-8000-000000000005'::text, 'submitted'::text),
    ('01980e26-0000-7000-8000-000000000006'::text, 'accepted'::text)
  $$,
  'course activities map revision, scheduling, submission, resubmission, and acceptance states exactly'
);

select results_eq(
  $$
    select
      projection ->> 'title',
      projection ->> 'content_version_id',
      projection ->> 'content_version_state',
      projection ->> 'progression_mode'
    from (select public.get_my_learning_course(
      '01980e20-0000-7000-8000-000000000001', 'de'
    ) projection) course_projection
  $$,
  $$ values (
    'Scheduled Boundary DE'::text,
    '01980e22-0000-7000-8000-000000000001'::text,
    'published'::text,
    'scheduled'::text
  ) $$,
  'scheduled workspace exposes the requested localization and exact immutable pin'
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000001', 'invalid'
  ) ->> 'title',
  'Scheduled Boundary EN',
  'scheduled workspace also applies strict unsupported-locale fallback'
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000001', 'en'
  ) #>> '{stages,0,activities,0,description}',
  'Revision First instructions EN',
  'learner descriptions are plain text rather than unsanitized snapshot markup'
);

select ok(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000001', 'en'
  )::text !~* (
    'model_answer|is_correct|correct_option_ids|rubric|object_key|option_key|'
    || 'skill_mappings|prerequisites|internal_'
  ),
  'scheduled course projection strips every deliberately embedded hidden field'
);

select results_eq(
  $$
    select task_id, public.get_my_learning_task(task_id) is not null
    from (values
      ('01980e26-0000-7000-8000-000000000001'::uuid),
      ('01980e26-0000-7000-8000-000000000002'::uuid),
      ('01980e26-0000-7000-8000-000000000003'::uuid),
      ('01980e26-0000-7000-8000-000000000004'::uuid),
      ('01980e26-0000-7000-8000-000000000005'::uuid),
      ('01980e26-0000-7000-8000-000000000006'::uuid)
    ) fixture(task_id)
    order by task_id
  $$,
  $$ values
    ('01980e26-0000-7000-8000-000000000001'::uuid, true),
    ('01980e26-0000-7000-8000-000000000002'::uuid, false),
    ('01980e26-0000-7000-8000-000000000003'::uuid, true),
    ('01980e26-0000-7000-8000-000000000004'::uuid, true),
    ('01980e26-0000-7000-8000-000000000005'::uuid, true),
    ('01980e26-0000-7000-8000-000000000006'::uuid, false)
  $$,
  'task detail preserves open work after schedule expiry but denies future and accepted tasks'
);

select results_eq(
  $$
    select
      projection ->> 'content_version_id',
      projection #>> '{title,en}',
      projection #>> '{title,de}',
      projection #>> '{title,ru}',
      projection #>> '{assessment,selection_mode}',
      jsonb_array_length(projection #> '{assessment,options}')
    from (select public.get_my_learning_task(
      '01980e26-0000-7000-8000-000000000001'
    ) projection) task_projection
  $$,
  $$ values (
    '01980e22-0000-7000-8000-000000000001'::text,
    'Revision First EN'::text,
    'Revision First DE'::text,
    'Revision First RU'::text,
    'single'::text,
    2::integer
  ) $$,
  'task detail exposes complete localized safe content from the exact publication'
);

select ok(
  public.get_my_learning_task(
    '01980e26-0000-7000-8000-000000000001'
  )::text !~* (
    'model_answer|is_correct|correct_option_ids|rubric|object_key|option_key|'
    || 'skill_mappings|prerequisites|internal_'
  ),
  'scheduled task projection strips hidden correctness, rubric, competency, and storage fields'
);

select is(
  (
    select count(*)
    from jsonb_object_keys(public.get_my_learning_task(
      '01980e26-0000-7000-8000-000000000001'
    ) #> '{assessment,options,0}')
  ),
  2::bigint,
  'assessment options expose only an opaque id and localized label'
);

select results_eq(
  $$
    select
      projection ->> 'content_version_state',
      projection ->> 'enrollment_state',
      projection #>> '{stages,0,activities,0,state}',
      projection #>> '{stages,0,activities,1,state}'
    from (select public.get_my_learning_course(
      '01980e20-0000-7000-8000-000000000002', 'en'
    ) projection) course_projection
  $$,
  $$ values (
    'archived'::text,
    'completed'::text,
    'locked'::text,
    'accepted'::text
  ) $$,
  'completed history locks non-accepted attempts and preserves accepted evidence only'
);

select results_eq(
  $$
    select completed_activities, total_activities, next_task_id
    from public.list_my_learning_courses('en')
    where enrollment_id = '01980e33-0000-7000-8000-000000000003'
  $$,
  $$ values (1::bigint, 2::bigint, null::uuid) $$,
  'completed history reports accepted evidence without exposing a next action'
);

select is(
  public.get_my_learning_task(
    '01980e26-0000-7000-8000-000000000007'
  ),
  null::jsonb,
  'completed revision history never reopens task detail'
);

select is(
  public.get_my_learning_task(
    '01980e26-0000-7000-8000-00000000000c'
  ),
  null::jsonb,
  'completed accepted history remains read-only at the task boundary'
);

select results_eq(
  $$
    select
      projection ->> 'progression_mode',
      projection #>> '{stages,0,activities,0,state}',
      public.get_my_learning_task(
        '01980e26-0000-7000-8000-00000000000b'
      ) is not null
    from (select public.get_my_learning_course(
      '01980e20-0000-7000-8000-000000000005', 'en'
    ) projection) course_projection
  $$,
  $$ values ('flexible'::text, 'available'::text, true) $$,
  'flexible mode requires learning entitlement and no schedule row'
);

reset role;

-- A request/approval is never sufficient to obtain task or course-workspace
-- content, including a task that exists only in a later publication.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000003', 'en'
  ),
  null::jsonb,
  'an approved but unassigned enrollment cannot read a course workspace'
);

select is(
  public.get_my_learning_task(
    '01980e26-0000-7000-8000-000000000009'
  ),
  null::jsonb,
  'a pending preview cannot open a task from the latest publication'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Flexible progression is gated by an active learning entitlement. Snapshot
-- prerequisite evaluation is deliberately not claimed by this migration.
delete from public.entitlements
where id = '01980e41-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000005', 'en'
  ) #>> '{stages,0,activities,0,state}',
  'locked',
  'flexible activity becomes locked when the actor loses learning entitlement'
);

select is(
  public.get_my_learning_task(
    '01980e26-0000-7000-8000-00000000000b'
  ),
  null::jsonb,
  'flexible task detail fails closed when learning entitlement is absent'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source
)
values (
  '01980e41-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980e00-0000-7000-8000-000000000001',
  '01980a40-0000-7000-8000-000000000001', 'learning', 'manual'
);

-- Exact active cohort membership is part of every assigned read.
update public.cohort_memberships
set state = 'suspended'
where id = '01980e31-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000001', 'en'
  ),
  null::jsonb,
  'a suspended scheduled cohort membership removes course access'
);

select is(
  public.get_my_learning_task(
    '01980e26-0000-7000-8000-000000000001'
  ),
  null::jsonb,
  'a suspended scheduled cohort membership removes task access'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.cohort_memberships
set state = 'active'
where id = '01980e31-0000-7000-8000-000000000001';

-- Completed history is also scoped to an active retained learner membership;
-- terminal membership policy remains an explicit coordinator decision.
update public.cohort_memberships
set state = 'suspended'
where id = '01980e31-0000-7000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000002', 'en'
  ),
  null::jsonb,
  'suspending retained cohort membership hides completed history'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.cohort_memberships
set state = 'active'
where id = '01980e31-0000-7000-8000-000000000002';

-- Profile, organization membership, and learner role are independent
-- server-validated gates. Each must fail closed even with a valid JWT subject.
update public.profiles
set state = 'inactive', deactivated_at = statement_timestamp()
where user_id = '01980e00-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  (select count(*) from public.list_my_learning_courses('en')),
  0::bigint,
  'an inactive profile receives no learner projections'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.profiles
set state = 'active', deactivated_at = null
where user_id = '01980e00-0000-7000-8000-000000000001';

update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980e00-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  (select count(*) from public.list_my_learning_courses('en')),
  0::bigint,
  'a suspended organization membership receives no tenant learner projections'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980e00-0000-7000-8000-000000000001';

update public.user_roles role_assignment
set revoked_at = statement_timestamp()
where role_assignment.user_id = '01980e00-0000-7000-8000-000000000001'
  and role_assignment.role_id = (
    select role_record.id from public.roles role_record
    where role_record.code = 'learner'
  );

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  (select count(*) from public.list_my_learning_courses('en')),
  0::bigint,
  'a revoked learner role receives no learner projections'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.user_roles role_assignment
set revoked_at = null
where role_assignment.user_id = '01980e00-0000-7000-8000-000000000001'
  and role_assignment.role_id = (
    select role_record.id from public.roles role_record
    where role_record.code = 'learner'
  );

-- The other-tenant learner can see only their own pending row, proving both
-- tenant membership and actor ownership are required.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000002', true
);

select results_eq(
  $$
    select enrollment_id, title
    from public.list_my_learning_courses('ru')
  $$,
  $$ values (
    '01980e33-0000-7000-8000-000000000006'::uuid,
    'Other Tenant Pending RU'::text
  ) $$,
  'other-tenant learner sees only their actor-owned localized request'
);

select is(
  public.get_my_learning_course(
    '01980e20-0000-7000-8000-000000000001', 'en'
  ),
  null::jsonb,
  'other-tenant learner cannot read main-tenant assigned course content'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

-- If the newest publication is malformed, the pending preview fails closed.
-- It never silently falls back to an older version and masks publication data
-- corruption.
insert into public.content_versions (
  id, course_id, version_number, state, change_summary, snapshot,
  created_by, published_by, published_at
)
values (
  '01980e22-0000-7000-8000-000000000013',
  '01980e20-0000-7000-8000-000000000003', 2, 'published',
  'deliberately malformed latest publication', '{}'::jsonb,
  '01980a00-0000-7000-8000-000000000003',
  '01980a00-0000-7000-8000-000000000003', statement_timestamp()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980e00-0000-7000-8000-000000000001', true
);

select is(
  (
    select count(*)
    from public.list_my_learning_courses('en') course_record
    where course_record.enrollment_id =
      '01980e33-0000-7000-8000-000000000004'
  ),
  0::bigint,
  'a malformed latest pending publication is omitted rather than downgraded'
);

select is(
  (
    select course_record.content_version_id
    from public.list_my_learning_courses('en') course_record
    where course_record.enrollment_id =
      '01980e33-0000-7000-8000-000000000002'
  ),
  '01980e22-0000-7000-8000-000000000001'::uuid,
  'malformed unrelated publication data cannot move an assigned exact pin'
);

reset role;

select * from finish();
rollback;
