begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

select hasnt_column(
  'public', 'task_options', 'is_correct',
  'learner-readable task options contain no correctness column'
);
select hasnt_column(
  'public', 'task_localizations', 'model_answer',
  'learner-readable task localizations contain no model-answer column'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::bigint from public.task_options),
  0::bigint,
  'learner cannot read normalized task option authoring rows directly'
);
select is(
  (select count(*)::bigint from public.task_option_answers),
  0::bigint,
  'learner JWT cannot read option correctness rows'
);
select is(
  (select count(*)::bigint from public.task_model_answers),
  0::bigint,
  'learner JWT cannot read trainer model answers'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select is(
  (select count(*)::bigint from public.task_option_answers),
  2::bigint,
  'assigned trainer can read correctness rows'
);
select is(
  (select count(*)::bigint from public.task_model_answers),
  3::bigint,
  'assigned trainer can read localized model answers'
);

select * from finish();
rollback;
