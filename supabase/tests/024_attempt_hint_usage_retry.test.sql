begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.save_attempt_draft(uuid,bigint,text,uuid[],jsonb,integer,uuid[])'::pg_catalog.regprocedure
  ) like '%on conflict on constraint attempt_hint_usage_unique do nothing%',
  'draft saves use the attempt-and-hint idempotency constraint'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '01980a00-0000-7000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001',
      (
        select draft_record.row_version
        from public.attempt_drafts draft_record
        where draft_record.attempt_id =
          '01980a34-0000-7000-8000-000000000001'
      ),
      'First retry-safe hint save',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      '[]'::jsonb,
      120,
      array['01980a29-0000-7000-8000-000000000001'::uuid]
    )
  $$,
  'the first save records a valid hint usage'
);

select is(
  (
    select count(*)::bigint
    from public.attempt_hint_usage usage_record
    where usage_record.attempt_id =
        '01980a34-0000-7000-8000-000000000001'
      and usage_record.hint_id =
        '01980a29-0000-7000-8000-000000000001'
  ),
  1::bigint,
  'the first save leaves exactly one usage fact'
);

select set_config(
  'ditele_test.hint_first_used_at',
  (
    select usage_record.first_used_at::text
    from public.attempt_hint_usage usage_record
    where usage_record.attempt_id =
        '01980a34-0000-7000-8000-000000000001'
      and usage_record.hint_id =
        '01980a29-0000-7000-8000-000000000001'
  ),
  true
);

select is(
  (
    select attempt_record.hint_first_used_at
    from public.attempts attempt_record
    where attempt_record.id =
      '01980a34-0000-7000-8000-000000000001'
  ),
  current_setting('ditele_test.hint_first_used_at')::timestamptz,
  'attempt telemetry points at the first immutable usage fact'
);

select lives_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001',
      (
        select draft_record.row_version
        from public.attempt_drafts draft_record
        where draft_record.attempt_id =
          '01980a34-0000-7000-8000-000000000001'
      ),
      'Repeated retry-safe hint save',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      '[]'::jsonb,
      180,
      array['01980a29-0000-7000-8000-000000000001'::uuid]
    )
  $$,
  'a repeated save with the same hint is idempotent'
);

select is(
  (
    select count(*)::bigint
    from public.attempt_hint_usage usage_record
    where usage_record.attempt_id =
        '01980a34-0000-7000-8000-000000000001'
      and usage_record.hint_id =
        '01980a29-0000-7000-8000-000000000001'
  ),
  1::bigint,
  'the repeated save does not duplicate the usage fact'
);

select is(
  (
    select usage_record.first_used_at
    from public.attempt_hint_usage usage_record
    where usage_record.attempt_id =
        '01980a34-0000-7000-8000-000000000001'
      and usage_record.hint_id =
        '01980a29-0000-7000-8000-000000000001'
  ),
  current_setting('ditele_test.hint_first_used_at')::timestamptz,
  'the repeated save retains the original usage timestamp'
);

select is(
  (
    select attempt_record.hint_first_used_at
    from public.attempts attempt_record
    where attempt_record.id =
      '01980a34-0000-7000-8000-000000000001'
  ),
  current_setting('ditele_test.hint_first_used_at')::timestamptz,
  'the repeated save retains the original attempt hint timestamp'
);

select is(
  (
    select draft_record.answer_text
    from public.attempt_drafts draft_record
    where draft_record.attempt_id =
      '01980a34-0000-7000-8000-000000000001'
  ),
  'Repeated retry-safe hint save'::text,
  'the retry still persists the latest valid draft content'
);

select * from finish();
rollback;
