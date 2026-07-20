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
        'update_own_profile',
        'mark_notification_read',
        'mark_all_notifications_read',
        'set_notification_family_preferences'
      )
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  4::bigint,
  'all learner account commands are security-definer functions with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_own_profile(text,text,text,bigint,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.mark_notification_read(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.mark_all_notifications_read(timestamptz,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.set_notification_family_preferences(text,boolean,boolean,boolean,bigint,bigint,bigint,text,uuid)',
    'EXECUTE'
  ),
  'authenticated sessions can execute every field-limited account command'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_own_profile(text,text,text,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.mark_notification_read(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.mark_all_notifications_read(timestamptz,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.set_notification_family_preferences(text,boolean,boolean,boolean,bigint,bigint,bigint,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers have no account-command execute grants'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated callers cannot directly mutate protected profile columns'
);

select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'INSERT')
  and not has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.notifications', 'DELETE'),
  'authenticated callers cannot directly mutate notification ownership or delivery facts'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.notification_preferences', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.notification_preferences', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.notification_preferences', 'DELETE'
  ),
  'authenticated callers cannot bypass notification preference CAS commands'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.learner_account_command_receipts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.learner_account_command_receipts', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.learner_account_command_receipts', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.learner_account_command_receipts', 'DELETE'
  ),
  'account command receipts remain private and append-only'
);

select has_column(
  'public', 'notifications', 'row_version',
  'notifications expose an optimistic row version'
);
select has_column(
  'public', 'notification_preferences', 'row_version',
  'notification preferences expose an optimistic row version'
);

select is(
  (
    select array_to_string(procedure_record.proargnames, ',')
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.update_own_profile(text,text,text,bigint,text,uuid)'::pg_catalog.regprocedure
  ),
  'p_display_name,p_locale,p_timezone,p_expected_version,p_idempotency_key,p_correlation_id',
  'the profile command has no caller-controlled target user or protected-column input'
);

insert into public.notifications (
  id, organization_id, recipient_id, event_type, template_key, payload,
  deduplication_key, state, created_at
)
values
  (
    '01980c10-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    'question.answered', 'notifications.question_answered',
    jsonb_build_object(
      'question_id', '01980c11-0000-7000-8000-000000000001'
    ),
    'account-command-test:learner:one', 'pending',
    statement_timestamp() - interval '3 minutes'
  ),
  (
    '01980c10-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    'review.decided', 'notifications.review_decided',
    jsonb_build_object(
      'submission_id', '01980c12-0000-7000-8000-000000000001',
      'decision', 'accepted'
    ),
    'account-command-test:learner:two', 'delivered',
    statement_timestamp() - interval '2 minutes'
  ),
  (
    '01980c10-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    'enrollment.assigned', 'notifications.enrollment_assigned',
    jsonb_build_object(
      'course_id', '01980a20-0000-7000-8000-000000000001',
      'cohort_id', '01980a30-0000-7000-8000-000000000001'
    ),
    'account-command-test:learner:future', 'pending',
    statement_timestamp() + interval '30 minutes'
  ),
  (
    '01980c10-0000-7000-8000-000000000004',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'submission.transferred', 'notifications.submission_transferred',
    jsonb_build_object(
      'submission_id', '01980c12-0000-7000-8000-000000000002'
    ),
    'account-command-test:trainer:one', 'delivered',
    statement_timestamp() - interval '1 minute'
  ),
  (
    '01980c10-0000-7000-8000-000000000005',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    'review.decided', 'notifications.review_decided',
    jsonb_build_object(
      'submission_id', '01980c12-0000-7000-8000-000000000003',
      'decision', 'revision_required'
    ),
    'account-command-test:learner:cancelled-state', 'cancelled',
    statement_timestamp() - interval '1 minute'
  );

select set_config(
  'ditele.test_profile_version',
  (
    select profile_record.row_version::text
    from public.profiles profile_record
    where profile_record.user_id = '01980a00-0000-7000-8000-000000000001'
  ),
  true
);
select set_config(
  'ditele.test_read_boundary', statement_timestamp()::text, true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ update public.profiles
     set state = 'inactive', avatar_object_key = 'forbidden-avatar'
     where user_id = '01980a00-0000-7000-8000-000000000001' $$,
  '42501', 'permission denied for table profiles',
  'a learner cannot directly change protected profile columns'
);

select throws_ok(
  $$ update public.notifications
     set recipient_id = '01980a00-0000-7000-8000-000000000002',
         payload = '{"leaked":true}'::jsonb
     where id = '01980c10-0000-7000-8000-000000000001' $$,
  '42501', 'permission denied for table notifications',
  'a learner cannot directly change notification ownership or payload'
);

select throws_ok(
  $$ insert into public.notification_preferences (
       user_id, channel, event_family, enabled
     ) values (
       '01980a00-0000-7000-8000-000000000002',
       'email', 'review', false
     ) $$,
  '42501', 'permission denied for table notification_preferences',
  'a learner cannot directly write another user preference'
);

select lives_ok(
  format(
    $$ select public.update_own_profile(
         '  Lena Quality  ', 'de', 'Europe/Berlin', %s,
         'profile-update-test-0001',
         '01980c20-0000-7000-8000-000000000001'
       ) $$,
    current_setting('ditele.test_profile_version')
  ),
  'a learner can update only their own supported profile fields'
);

select results_eq(
  $$ select display_name, locale, timezone, state, avatar_object_key,
            source_system, external_id, deactivated_at
     from public.profiles
     where user_id = '01980a00-0000-7000-8000-000000000001' $$,
  $$ values (
       'Lena Quality'::text, 'de'::text, 'Europe/Berlin'::text,
       'active'::public.record_state, null::text, null::text, null::text,
       null::timestamptz
     ) $$,
  'the profile command trims the name and preserves every protected field'
);

select lives_ok(
  format(
    $$ select public.update_own_profile(
         '  Lena Quality  ', 'de', 'Europe/Berlin', %s,
         'profile-update-test-0001',
         '01980c20-0000-7000-8000-000000000001'
       ) $$,
    current_setting('ditele.test_profile_version')
  ),
  'an identical profile command replay returns successfully'
);

reset role;
select is(
  (
    select count(*)::bigint
    from public.audit_events audit_record
    where audit_record.event_type = 'profile.updated'
      and audit_record.correlation_id =
        '01980c20-0000-7000-8000-000000000001'
  ),
  1::bigint,
  'a profile command replay does not duplicate the audit event'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  format(
    $$ select public.update_own_profile(
         'Different name', 'de', 'Europe/Berlin', %s,
         'profile-update-test-0001',
         '01980c20-0000-7000-8000-000000000002'
       ) $$,
    current_setting('ditele.test_profile_version')
  ),
  '22023',
  'idempotency key was reused with a different profile payload',
  'a profile idempotency key cannot be rebound to different data'
);

select throws_ok(
  format(
    $$ select public.update_own_profile(
         'Lena Quality', 'de', 'Mars/Olympus', %s,
         'profile-update-test-0002',
         '01980c20-0000-7000-8000-000000000003'
       ) $$,
    (
      select profile_record.row_version
      from public.profiles profile_record
      where profile_record.user_id = '01980a00-0000-7000-8000-000000000001'
    )
  ),
  '22023',
  'valid profile values, CAS, idempotency key and correlation ID are required',
  'an unknown timezone is rejected inside the database boundary'
);

select throws_ok(
  format(
    $$ select public.update_own_profile(
         'Lena Quality', 'de', 'Europe/Berlin', %s,
         'profile-update-test-0003',
         '01980c20-0000-7000-8000-000000000004'
       ) $$,
    current_setting('ditele.test_profile_version')
  ),
  '40001', 'profile is stale or unavailable',
  'a new profile command with an obsolete version is rejected'
);

select lives_ok(
  $$ select public.mark_notification_read(
       '01980c10-0000-7000-8000-000000000001', 1,
       'notification-read-test-0001',
       '01980c20-0000-7000-8000-000000000005'
     ) $$,
  'a learner can mark one owned unread notification as read'
);

select results_eq(
  $$ select state, read_at is not null, row_version
     from public.notifications
     where id = '01980c10-0000-7000-8000-000000000001' $$,
  $$ values ('pending'::public.notification_state, true, 2::bigint) $$,
  'mark-one-read preserves pending delivery state while advancing read facts and version'
);

select ok(
  exists (
    select 1
    from public.notifications notification_record
    where notification_record.id =
      '01980c10-0000-7000-8000-000000000001'
      and notification_record.state = 'pending'
      and notification_record.read_at is not null
  ),
  'reading an in-app record before provider delivery keeps it in the pending delivery queue'
);

select lives_ok(
  $$ select public.mark_notification_read(
       '01980c10-0000-7000-8000-000000000001', 1,
       'notification-read-test-0001',
       '01980c20-0000-7000-8000-000000000005'
     ) $$,
  'an identical mark-one command replay succeeds'
);

reset role;
select is(
  (
    select count(*)::bigint
    from public.audit_events audit_record
    where audit_record.event_type = 'notification.read'
      and audit_record.aggregate_id =
        '01980c10-0000-7000-8000-000000000001'
  ),
  1::bigint,
  'a mark-one replay does not duplicate its audit event'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ select public.mark_notification_read(
       '01980c10-0000-7000-8000-000000000002', 1,
       'notification-read-test-0001',
       '01980c20-0000-7000-8000-000000000006'
     ) $$,
  '22023',
  'idempotency key was reused with a different notification payload',
  'a mark-one key cannot be replayed against another notification'
);

select throws_ok(
  $$ select public.mark_notification_read(
       '01980c10-0000-7000-8000-000000000002', 2,
       'notification-read-test-0002',
       '01980c20-0000-7000-8000-000000000007'
     ) $$,
  '40001', 'notification is stale or already read',
  'a stale notification version is rejected'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select public.mark_notification_read(
       '01980c10-0000-7000-8000-000000000002', 1,
       'notification-cross-user-0001',
       '01980c20-0000-7000-8000-000000000008'
     ) $$,
  '42501', 'notification read scope denied',
  'another authenticated user cannot mark a learner notification read'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select public.update_own_profile(
       'Anonymous', 'en', 'UTC', 1,
       'anonymous-profile-test-0001',
       '01980c20-0000-7000-8000-000000000009'
     ) $$,
  '42501', 'permission denied for function update_own_profile',
  'anonymous callers cannot execute the profile command'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select lives_ok(
  format(
    $$ select public.mark_all_notifications_read(
         %L::timestamptz, 'notification-read-all-0001',
         '01980c20-0000-7000-8000-00000000000a'
       ) $$,
    current_setting('ditele.test_read_boundary')
  ),
  'mark-all-read applies to the learner inbox snapshot'
);

reset role;
select results_eq(
  $$ select id, state, read_at is not null
     from public.notifications
     where id in (
       '01980c10-0000-7000-8000-000000000002',
       '01980c10-0000-7000-8000-000000000003',
       '01980c10-0000-7000-8000-000000000004',
       '01980c10-0000-7000-8000-000000000005'
     )
     order by id $$,
  $$ values
       ('01980c10-0000-7000-8000-000000000002'::uuid, 'delivered'::public.notification_state, true),
       ('01980c10-0000-7000-8000-000000000003'::uuid, 'pending'::public.notification_state, false),
       ('01980c10-0000-7000-8000-000000000004'::uuid, 'delivered'::public.notification_state, false),
       ('01980c10-0000-7000-8000-000000000005'::uuid, 'cancelled'::public.notification_state, false) $$,
  'mark-all preserves delivery state and excludes future, cross-user, and state-cancelled records'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select lives_ok(
  format(
    $$ select public.mark_all_notifications_read(
         %L::timestamptz, 'notification-read-all-0001',
         '01980c20-0000-7000-8000-00000000000a'
       ) $$,
    current_setting('ditele.test_read_boundary')
  ),
  'an identical mark-all command replay succeeds'
);

reset role;
select is(
  (
    select count(*)::bigint
    from public.audit_events audit_record
    where audit_record.event_type = 'notification.read_all'
      and audit_record.correlation_id =
        '01980c20-0000-7000-8000-00000000000a'
  ),
  1::bigint,
  'a mark-all replay does not duplicate its audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select lives_ok(
  $$ select public.set_notification_family_preferences(
       'review', true, false, true, 0, 0, 0,
       'notification-pref-test-0001',
       '01980c20-0000-7000-8000-00000000000b'
     ) $$,
  'a learner can atomically create all three channel preferences for one family'
);

select results_eq(
  $$ select channel, enabled, row_version
     from public.notification_preferences
     where user_id = '01980a00-0000-7000-8000-000000000001'
       and event_family = 'review'
     order by channel $$,
  $$ values
       ('email'::text, false, 1::bigint),
       ('in_app'::text, true, 1::bigint),
       ('push'::text, true, 1::bigint) $$,
  'the preference command persists exactly the actor family and channel values'
);

select lives_ok(
  $$ select public.set_notification_family_preferences(
       'review', true, false, true, 0, 0, 0,
       'notification-pref-test-0001',
       '01980c20-0000-7000-8000-00000000000b'
     ) $$,
  'an identical notification preference replay succeeds'
);

reset role;
select is(
  (
    select count(*)::bigint
    from public.audit_events audit_record
    where audit_record.event_type = 'notification.preferences_updated'
      and audit_record.correlation_id =
        '01980c20-0000-7000-8000-00000000000b'
  ),
  1::bigint,
  'a preference replay does not duplicate its audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ select public.set_notification_family_preferences(
       'review', false, false, true, 0, 0, 0,
       'notification-pref-test-0001',
       '01980c20-0000-7000-8000-00000000000c'
     ) $$,
  '22023',
  'idempotency key was reused with a different preference payload',
  'a preference key cannot be rebound to another channel selection'
);

select throws_ok(
  $$ select public.set_notification_family_preferences(
       'review', false, true, false, 0, 0, 0,
       'notification-pref-test-0002',
       '01980c20-0000-7000-8000-00000000000d'
     ) $$,
  '40001', 'notification preference is stale',
  'a preference create command with obsolete zero versions is rejected'
);

select lives_ok(
  $$ select public.set_notification_family_preferences(
       'review', false, true, false, 1, 1, 1,
       'notification-pref-test-0003',
       '01980c20-0000-7000-8000-00000000000e'
     ) $$,
  'a preference update succeeds with all current row versions'
);

select results_eq(
  $$ select channel, enabled, row_version
     from public.notification_preferences
     where user_id = '01980a00-0000-7000-8000-000000000001'
       and event_family = 'review'
     order by channel $$,
  $$ values
       ('email'::text, true, 2::bigint),
       ('in_app'::text, false, 2::bigint),
       ('push'::text, false, 2::bigint) $$,
  'an optimistic preference update changes all three rows atomically'
);

select throws_ok(
  $$ select public.set_notification_family_preferences(
       'billing', true, true, true, 0, 0, 0,
       'notification-pref-test-0004',
       '01980c20-0000-7000-8000-00000000000f'
     ) $$,
  '22023',
  'valid preference values, CAS, idempotency key and correlation ID are required',
  'unsupported event families are rejected at the command boundary'
);

reset role;

select is(
  (
    select profile_record.display_name
    from public.profiles profile_record
    where profile_record.user_id = '01980a00-0000-7000-8000-000000000002'
  ),
  'Theo Trainer'::text,
  'self-service profile mutation never changes another user profile'
);

select is(
  (
    select count(*)::bigint
    from public.notification_preferences preference_record
    where preference_record.user_id =
      '01980a00-0000-7000-8000-000000000002'
  ),
  0::bigint,
  'self-service preference mutation never creates rows for another user'
);

select * from finish();
rollback;
