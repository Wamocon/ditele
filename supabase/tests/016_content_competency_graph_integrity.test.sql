begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select is(
  (
    select attribute_record.attnotnull
    from pg_catalog.pg_attribute attribute_record
    where attribute_record.attrelid = 'public.prerequisites'::regclass
      and attribute_record.attname = 'organization_id'
      and not attribute_record.attisdropped
  ),
  false,
  'global course task prerequisites support a null organization scope'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid in (
      'public.task_skill_mappings'::regclass,
      'public.skill_edges'::regclass,
      'public.prerequisites'::regclass
    )
      and trigger_record.tgname in (
        'task_skill_mappings_validate_scope',
        'task_skill_mappings_guard_published_graph',
        'skill_edges_validate_graph',
        'prerequisites_validate_graph',
        'prerequisites_guard_published_graph'
      )
      and not trigger_record.tgisinternal
  ),
  5::bigint,
  'competency scope, cycle, and publication guards are installed'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.policyname in (
        'task_skill_mappings_content_write',
        'skill_edges_content_write',
        'prerequisites_content_write'
      )
  ),
  3::bigint,
  'competency authoring uses derived content-manager policies only'
);

select ok(
  (
    select procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'app_private.build_content_snapshot(uuid)'::regprocedure
  )
  and (
    select procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'app_private.assert_competency_graph_ready(uuid)'::regprocedure
  ),
  'snapshot and readiness helpers are fixed-search-path security definers'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.build_content_snapshot_without_competencies(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.assert_competency_graph_ready(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.build_content_snapshot(uuid)', 'EXECUTE'
  ),
  'internal publication builders are not callable by API roles'
);

select is(
  (
    select jsonb_array_length(
      version_record.snapshot #> '{stages,0,tasks,0,skill_mappings}'
    )
    from public.content_versions version_record
    where version_record.id = '01980a22-0000-7000-8000-000000000001'
  ),
  1,
  'the seeded publication contains its reviewed task skill mapping'
);

select results_eq(
  $$ select
       snapshot #>> '{stages,0,tasks,0,skill_mappings,0,skill,code}',
       (snapshot #>>
         '{stages,0,tasks,0,skill_mappings,0,weight_basis_points}')::integer,
       snapshot #> '{stages,0,tasks,0,prerequisites}'
     from public.content_versions
     where id = '01980a22-0000-7000-8000-000000000001' $$,
  $$ values (
       'risk-based-test-design'::text,
       10000,
       '[]'::jsonb
     ) $$,
  'the publication stores deterministic allow-listed competency facts'
);

select ok(
  (
    select version_record.snapshot::text
      !~* 'model_answer|is_correct|correctness|object_key'
    from public.content_versions version_record
    where version_record.id = '01980a22-0000-7000-8000-000000000001'
  ),
  'competency enrichment does not reintroduce solution or storage fields'
);

insert into public.content_versions (
  id, course_id, version_number, state, change_summary, created_by
)
values (
  '01980d00-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  16, 'draft', 'Competency graph integrity fixture',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.stages (
  id, course_id, content_version_id, position, state
)
values (
  '01980d01-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980d00-0000-7000-8000-000000000001',
  0, 'draft'
);

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind,
  state, expected_minutes
)
values
  (
    '01980d02-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980d01-0000-7000-8000-000000000001',
    '01980d00-0000-7000-8000-000000000001',
    0, 'practical', 'draft', 20
  ),
  (
    '01980d02-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    '01980d01-0000-7000-8000-000000000001',
    '01980d00-0000-7000-8000-000000000001',
    1, 'knowledge', 'draft', 10
  );

insert into public.skills (
  id, organization_id, code, labels, descriptions, taxonomy_version, state
)
values
  (
    '01980d03-0000-7000-8000-000000000001', null,
    'competency-integrity-a',
    '{"en":"Integrity A","de":"Integrität A","ru":"Целостность A"}',
    '{"en":"First integrity skill"}', 16, 'active'
  ),
  (
    '01980d03-0000-7000-8000-000000000002', null,
    'competency-integrity-b',
    '{"en":"Integrity B","de":"Integrität B","ru":"Целостность B"}',
    '{"en":"Second integrity skill"}', 16, 'active'
  ),
  (
    '01980d03-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    'competency-integrity-tenant',
    '{"en":"Tenant only","de":"Nur Mandant","ru":"Только клиент"}',
    '{"en":"Tenant-only skill"}', 16, 'active'
  );

select throws_ok(
  $$ insert into public.task_skill_mappings (
       task_id, skill_id, mapping_version, weight_basis_points,
       evidence_required
     ) values (
       '01980d02-0000-7000-8000-000000000001',
       '01980d03-0000-7000-8000-000000000003',
       1, 10000, true
     ) $$,
  '23514',
  'task skill mapping scope must match its versioned course',
  'a global course cannot capture a tenant-owned skill'
);

insert into public.task_skill_mappings (
  id, task_id, skill_id, mapping_version, weight_basis_points,
  evidence_required
)
values
  (
    '01980d04-0000-7000-8000-000000000001',
    '01980d02-0000-7000-8000-000000000001',
    '01980d03-0000-7000-8000-000000000001',
    1, 6000, true
  ),
  (
    '01980d04-0000-7000-8000-000000000002',
    '01980d02-0000-7000-8000-000000000001',
    '01980d03-0000-7000-8000-000000000002',
    1, 3000, false
  ),
  (
    '01980d04-0000-7000-8000-000000000003',
    '01980d02-0000-7000-8000-000000000002',
    '01980d03-0000-7000-8000-000000000002',
    1, 10000, true
  );

select throws_ok(
  $$ select app_private.assert_competency_graph_ready(
       '01980d00-0000-7000-8000-000000000001'
     ) $$,
  '23514',
  'every task requires one complete 10000-point skill mapping set',
  'publication readiness rejects an incomplete mapping weight set'
);

update public.task_skill_mappings
set weight_basis_points = 4000
where id = '01980d04-0000-7000-8000-000000000002';

-- Practical publication readiness now requires the review rubric that the
-- trainer workflow consumes. Reuse the seeded global definition while this
-- fixture is still a mutable draft graph.
insert into public.task_rubric_assignments (
  id, organization_id, task_id, content_version_id, rubric_id, created_by
)
values (
  '01980d04-0000-7000-8000-000000000010', null,
  '01980d02-0000-7000-8000-000000000001',
  '01980d00-0000-7000-8000-000000000001',
  '01980a2b-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000003'
);

select lives_ok(
  $$ select app_private.assert_competency_graph_ready(
       '01980d00-0000-7000-8000-000000000001'
     ) $$,
  'publication readiness accepts complete active mapping sets'
);

insert into public.prerequisites (
  id, organization_id, target_task_id, required_task_id, rule_version
)
values (
  '01980d05-0000-7000-8000-000000000001',
  null,
  '01980d02-0000-7000-8000-000000000001',
  '01980d02-0000-7000-8000-000000000002',
  1
);

select throws_ok(
  $$ insert into public.prerequisites (
       organization_id, target_task_id, required_task_id, rule_version
     ) values (
       null,
       '01980d02-0000-7000-8000-000000000002',
       '01980d02-0000-7000-8000-000000000001',
       1
     ) $$,
  '23514',
  'task prerequisite graph must remain acyclic',
  'task prerequisites reject an indirect cycle'
);

insert into public.skill_edges (
  id, parent_skill_id, child_skill_id, relation
)
values (
  '01980d06-0000-7000-8000-000000000001',
  '01980d03-0000-7000-8000-000000000001',
  '01980d03-0000-7000-8000-000000000002',
  'prerequisite'
);

select throws_ok(
  $$ insert into public.skill_edges (
       parent_skill_id, child_skill_id, relation
     ) values (
       '01980d03-0000-7000-8000-000000000002',
       '01980d03-0000-7000-8000-000000000001',
       'prerequisite'
     ) $$,
  '23514',
  'skill prerequisite graph must remain acyclic',
  'skill prerequisites reject an indirect cycle'
);

select results_eq(
  $$ select
       jsonb_array_length(
         app_private.build_content_snapshot(
           '01980d00-0000-7000-8000-000000000001'
         ) #> '{stages,0,tasks,0,skill_mappings}'
       ),
       app_private.build_content_snapshot(
         '01980d00-0000-7000-8000-000000000001'
       ) #>> '{stages,0,tasks,0,prerequisites,0,required_task_id}' $$,
  $$ values (
       2,
       '01980d02-0000-7000-8000-000000000002'::text
     ) $$,
  'draft fingerprints and previews include ordered mappings and prerequisites'
);

select set_config(
  'ditele.test_competency_fingerprint',
  app_private.content_fingerprint(
    '01980d00-0000-7000-8000-000000000001'
  ),
  true
);

update public.task_skill_mappings
set weight_basis_points = case
  when id = '01980d04-0000-7000-8000-000000000001' then 5000
  else 5000
end
where id in (
  '01980d04-0000-7000-8000-000000000001',
  '01980d04-0000-7000-8000-000000000002'
);

select isnt(
  app_private.content_fingerprint(
    '01980d00-0000-7000-8000-000000000001'
  ),
  current_setting('ditele.test_competency_fingerprint'),
  'competency edits change the reviewed content fingerprint'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select is(
  (
    select count(*)::bigint
    from public.task_skill_mappings mapping_record
    where mapping_record.task_id =
      '01980d02-0000-7000-8000-000000000001'
  ),
  0::bigint,
  'a learner cannot bypass immutable projections with raw mapping reads'
);

select throws_ok(
  $$ insert into public.task_skill_mappings (
       task_id, skill_id, mapping_version, weight_basis_points,
       evidence_required
     ) values (
       '01980d02-0000-7000-8000-000000000002',
       '01980d03-0000-7000-8000-000000000001',
       1, 10000, true
     ) $$,
  '42501',
  null,
  'a learner cannot author task skill mappings'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$ update public.task_skill_mappings
     set weight_basis_points = 9999
     where id = '01980a2e-0000-7000-8000-000000000001' $$,
  '55000',
  'published content graph is immutable',
  'an authorized content manager cannot alter a published skill mapping'
);

select throws_ok(
  $$ insert into public.prerequisites (
       organization_id, target_task_id, required_skill_id,
       minimum_mastery_basis_points, rule_version
     ) values (
       null,
       '01980a26-0000-7000-8000-000000000001',
       '01980a2a-0000-7000-8000-000000000001',
       5000, 1
     ) $$,
  '55000',
  'published content graph is immutable',
  'an authorized content manager cannot append a published prerequisite'
);

reset role;
update public.profiles
set display_name = '   '
where user_id = '01980a00-0000-7000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select count(*)::bigint
    from public.list_active_cohort_trainers(
      '01980a30-0000-7000-8000-000000000001'
    )
  ),
  0::bigint,
  'submission transfer candidates exclude a blank legacy profile'
);

select is(
  (
    select count(*)::bigint
    from public.list_active_question_trainers(
      '01980a30-0000-7000-8000-000000000001'
    )
  ),
  0::bigint,
  'question transfer candidates exclude a blank legacy profile'
);

reset role;

select * from finish();
rollback;
