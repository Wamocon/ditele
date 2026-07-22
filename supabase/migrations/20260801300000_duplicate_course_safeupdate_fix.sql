-- ═══════════════════════════════════════════════════════════════════════════
-- duplicate_course has never worked over the API. Not once.
--
--     POST /rest/v1/rpc/duplicate_course
--     400  {"code":"21000","message":"DELETE requires a WHERE clause"}
--
-- The function clears its four temp mapping tables between phases with
--
--     delete from tmp_stage_map;
--     delete from tmp_task_map;
--     delete from tmp_localization_map;
--     delete from tmp_option_map;
--
-- and this deployment loads the `safeupdate` extension for the role PostgREST
-- connects as:
--
--     authenticator  session_preload_libraries=safeupdate
--
-- safeupdate rejects any UPDATE or DELETE with no WHERE clause. It applies to
-- the whole session, so it fires inside a SECURITY DEFINER function too — the
-- definer's rights change who may touch a row, not which statements the loaded
-- hooks allow.
--
--
-- ⚠️ WHY EVERY EARLIER CHECK PASSED, AND WHAT THAT MEANS FOR THIS REPOSITORY
--
-- `psql` connects as `postgres`. `postgres` has no `session_preload_libraries`,
-- so safeupdate is not loaded and the bare DELETEs are legal. Phase 1a verified
-- this function in a rolled-back psql transaction, in detail — source and copy
-- counted row by row, enrolments confirmed not copied — and every one of those
-- assertions was true. The function is correct. It simply cannot be CALLED the
-- way the application calls it.
--
-- Even `set local role authenticated` in psql does not reproduce it:
-- `session_preload_libraries` is applied when the connection is established,
-- not when the role is switched, so a psql session that becomes `authenticated`
-- still has no safeupdate loaded.
--
-- So: **psql cannot verify a write path in this deployment.** It proves the SQL
-- and nothing about the request. This is now the third distinct failure class
-- that only appeared over HTTP — after the missing `execute` grants and the
-- commit-dependent bugs in 20260731100000 — and it is the most severe, because
-- the feature was shipped, documented as verified, and had no caller until
-- Phase 2 added the "Duplizieren" button that would have failed on first click.
--
--
-- THE FIX
--
-- `truncate` rather than `delete … where true`. Both satisfy safeupdate, but
-- truncate is what "empty this scratch table" means, it does not accumulate
-- dead tuples the transaction will never vacuum, and it cannot be quietly
-- turned back into an unguarded DELETE by a later edit that drops the
-- now-pointless predicate.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $fix$
declare
  function_body text;
  target text;
  occurrences integer;
  patched integer := 0;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname = 'duplicate_course';

  if function_body is null then
    raise exception 'duplicate_course not found — refusing to guess its body'
      using errcode = '55000';
  end if;

  foreach target in array array[
    'tmp_stage_map', 'tmp_task_map', 'tmp_localization_map', 'tmp_option_map'
  ] loop
    occurrences := (length(function_body)
                    - length(replace(function_body, 'delete from ' || target || ';', '')))
                   / length('delete from ' || target || ';');
    if occurrences > 1 then
      raise exception 'expected at most 1 bare delete for %, found %', target, occurrences
        using errcode = '55000';
    end if;
    if occurrences = 1 then
      function_body := replace(
        function_body,
        'delete from ' || target || ';',
        'truncate ' || target || ';'
      );
      patched := patched + 1;
    end if;
  end loop;

  if patched = 0 then
    raise notice 'no bare deletes left in duplicate_course — nothing to do';
    return;
  end if;

  execute format(
    'create or replace function public.duplicate_course('
    || 'p_source_course_id uuid, p_new_slug text, '
    || 'p_title_suffix text default '' (Kopie)'') '
    || 'returns uuid language plpgsql security definer '
    || 'set search_path = public, app_private, pg_temp as %L',
    function_body
  );
  alter function public.duplicate_course(uuid, text, text) owner to postgres;
  grant execute on function public.duplicate_course(uuid, text, text) to authenticated;

  raise notice 'duplicate_course: % bare delete(s) replaced with truncate', patched;
end
$fix$;

commit;

-- ─── Verification ─────────────────────────────────────────────────────────
--
-- ⚠️ This block can only prove the body no longer contains a bare DELETE. It
-- CANNOT prove the fix works, because it runs in psql, where safeupdate is not
-- loaded and the broken version passed too. The real check is an HTTP call as a
-- signed-in admin, and it is the one that matters.
do $verify$
declare
  function_body text;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname = 'duplicate_course';

  if function_body ~ 'delete\s+from\s+tmp_\w+\s*;' then
    raise exception
      'duplicate_course still contains a DELETE with no WHERE clause; safeupdate '
      'will reject it on every API call'
      using errcode = '55000';
  end if;
  if function_body !~ 'truncate\s+tmp_stage_map\s*;' then
    raise exception 'the truncate replacement did not take' using errcode = '55000';
  end if;

  raise notice 'duplicate_course is free of unguarded DELETEs — now verify it '
    'over HTTP, which is the only place this bug was ever visible';
end
$verify$;
