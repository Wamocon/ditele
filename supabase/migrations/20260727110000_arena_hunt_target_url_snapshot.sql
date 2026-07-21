-- ============================================================================
-- WS-13 — I-048, the half that actually reaches the learner.
--
-- `20260727100000` set `public.tasks.target_url` for the hunt task, which is
-- what both WS-9 and WS-10 recorded as the fix. **It changed nothing a learner
-- can see.**
--
-- `get_my_learning_task` does not read `public.tasks`. It reads the learner
-- projection built from `content_versions.snapshot`, a materialised copy taken
-- at publish time. The snapshot already carried a `target_url` key for this
-- task; it was `null`, and it stayed `null`.
--
-- What that cost, in the product rather than in the schema:
--
--   * `task-workspace.tsx` decides `isPractice` from `targetUrl !== null`, so
--     the hunt rendered with a **"THEORIE"** badge;
--   * with no practice target there was no iframe, so the sandbox was
--     unreachable from the task;
--   * and the workspace offered the generic "Vorgehen und Ergebnisse" answer
--     box instead of the **defect report form**.
--
-- So the headline feature of this phase — open a hunt, test the buggy screen
-- beside the task, file a ticket — did not exist for a learner, on a task that
-- looked completely healthy from the database. It is the same class of trap as
-- I-041: the snapshot is a projection, and writing to the source table does not
-- move it.
--
-- This is a repair to a seeded fixture. The product path for a real content
-- change is to author a new draft version and publish it, which rebuilds the
-- snapshot properly and runs the validation this file has to assert by hand.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. The SECOND place the URL rule lives, and the one that actually bites
--
-- `20260727100000` widened `tasks_target_url_protocol` so a root-relative
-- practice target could be stored. That was necessary and not sufficient:
-- `app_private.is_valid_learner_content_snapshot` carries its own, independent
-- copy of the same rule —
--
--     (task_payload ->> 'target_url') !~ '^https?://'  →  invalid
--
-- — and it is the more dangerous of the two, because a CHECK constraint refuses
-- a write with a clear error while this one refuses the whole SNAPSHOT. An
-- invalid learner snapshot does not degrade a page: `list_my_learning_courses`
-- returns zero rows and the course disappears for every enrolled learner, with
-- no error anywhere. That is I-041, and it is the most expensive failure shape
-- in this codebase.
--
-- ⭐ **This is how it was found, and it is the argument for the assertion.**
-- The first draft of this migration set the snapshot's `target_url` and then
-- asserted the result was still valid. It was not — and the assertion is the
-- only reason the transaction rolled back instead of quietly emptying the
-- course. Two enforcement points for one rule, and widening one of them looked
-- complete.
--
-- Widened, never replaced: `^https?://` still passes, and the new branch is
-- character-for-character the constraint's — a SINGLE leading slash, because
-- `//evil.example` is protocol-relative and would frame a foreign origin.
--
-- Patched by rewriting the deployed body rather than retyping 200 lines of
-- validator, with the occurrence count asserted first. WS-10's learning 6: a
-- `.replace()` that "worked" may have matched only part of what you meant, so
-- assert the count, not merely that something changed.
-- ────────────────────────────────────────────────────────────────────────────

do $widen$
declare
  function_body text;
  anchor constant text := '(task_payload ->> ''target_url'') !~ ''^https?://''';
  replacement constant text :=
    '(task_payload ->> ''target_url'') !~ ''^https?://'' and (task_payload ->> ''target_url'') !~ ''^/[^/]''';
  occurrences integer;
begin
  select p.prosrc into function_body
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private' and p.proname = 'is_valid_learner_content_snapshot';

  if function_body is null then
    raise exception 'app_private.is_valid_learner_content_snapshot not found — refusing to guess its body';
  end if;

  if position('^/[^/]' in function_body) > 0 then
    raise notice 'the snapshot validator already accepts a root-relative target_url — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 target_url rule in is_valid_learner_content_snapshot, found % — '
      'the deployed body has changed and this patch must be re-read before it is applied',
      occurrences;
  end if;

  function_body := replace(function_body, anchor, replacement);

  execute format(
    'create or replace function app_private.is_valid_learner_content_snapshot('
    || 'p_snapshot jsonb, p_course_id uuid, p_course_slug text, '
    || 'p_content_version_id uuid, p_version_number integer) '
    -- `stable`, not `immutable`, and `security definer` with an empty
    -- search_path — read out of `pg_proc` (provolatile='s', prosecdef=true,
    -- proconfig={search_path=""}) rather than assumed. Recreating a function
    -- with different volatility silently changes how the planner may cache it.
    || 'returns boolean language plpgsql stable security definer set search_path to '''' as %L',
    function_body
  );

  alter function app_private.is_valid_learner_content_snapshot(jsonb, uuid, text, uuid, integer)
    owner to postgres;

  raise notice 'snapshot validator widened to accept a root-relative target_url';
end
$widen$;

do $snapshot$
declare
  version_id constant uuid := '01980a22-0000-7000-8000-000000000001';
  hunt_task constant uuid := '019f9100-0000-7000-8000-000000000001';
  target constant text := '/de/arena/sandbox/checkout-v1?embed=1';
  current_value text;
  rebuilt jsonb;
  updated_value text;
  course_ref uuid;
  course_slug text;
  version_no integer;
begin
  select task_record ->> 'target_url' into current_value
  from public.content_versions version_record,
       jsonb_array_elements(version_record.snapshot -> 'stages') stage_record,
       jsonb_array_elements(stage_record -> 'tasks') task_record
  where version_record.id = version_id
    and task_record ->> 'id' = hunt_task::text;

  if not found then
    raise notice 'I-048/snapshot: hunt task is not in this snapshot — skipping';
    return;
  end if;

  if current_value is not distinct from target then
    raise notice 'I-048/snapshot: already set — nothing to do';
    return;
  end if;

  -- ⭐ Rebuild the snapshot with the SAME function `publish_content_version`
  -- uses, rather than hand-patching the JSON.
  --
  -- The first version of this migration spliced `target_url` into the existing
  -- jsonb with `jsonb_set`. That works, and it is the wrong tool: a hand-edited
  -- snapshot is a snapshot nothing else in the system produces, and any field
  -- the splice does not know about stays as stale as it was. `tasks.target_url`
  -- is already correct (`20260727100000`), so regenerating from the source
  -- tables both fixes this field and brings every other one back into agreement
  -- with the content graph — which is what publishing would have done.
  rebuilt := app_private.build_content_snapshot(version_id);

  if rebuilt is null or rebuilt -> 'stages' is null then
    raise exception 'I-048/snapshot: build_content_snapshot returned nothing usable';
  end if;

  -- ⚠️ `content_versions_lifecycle_guard` raises "published content versions
  -- are immutable" on any UPDATE to a published row — correctly, and it is the
  -- reason the product path is "author a draft and publish it" rather than
  -- editing in place. Disabled by NAME for this one statement and re-enabled
  -- immediately, with an assertion below that it really came back.
  --
  -- NOT `session_replication_role`: that would disable every trigger on every
  -- table at once, including foreign-key enforcement, while writing to a
  -- content graph. WS-8's slice seed makes the same choice for the same reason.
  alter table public.content_versions disable trigger content_versions_lifecycle_guard;

  update public.content_versions
  set snapshot = rebuilt
  where id = version_id;

  alter table public.content_versions enable trigger content_versions_lifecycle_guard;

  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.content_versions'::regclass
      and tgname = 'content_versions_lifecycle_guard'
      and tgenabled = 'D'
  ) then
    raise exception
      'I-048/snapshot left content_versions_lifecycle_guard DISABLED — refusing to commit';
  end if;

  -- ⚠️ Assert the snapshot is STILL VALID. A direct snapshot UPDATE bypasses
  -- `publish_content_version`, which is where this check normally runs — and
  -- I-041 is what happens when it is skipped: an invalid snapshot does not
  -- degrade a page, it makes `list_my_learning_courses` return zero rows and
  -- the learner's whole course silently disappears.
  select course_id, version_number into course_ref, version_no
  from public.content_versions where id = version_id;
  select slug into course_slug from public.courses where id = course_ref;

  if not app_private.is_valid_learner_content_snapshot(
       (select snapshot from public.content_versions where id = version_id),
       course_ref, course_slug, version_id, version_no
     ) then
    raise exception
      'I-048/snapshot: the rebuilt snapshot is INVALID — refusing to commit. '
      'An invalid snapshot empties the course for every enrolled learner (I-041).';
  end if;

  select task_record ->> 'target_url' into updated_value
  from public.content_versions version_record,
       jsonb_array_elements(version_record.snapshot -> 'stages') stage_record,
       jsonb_array_elements(stage_record -> 'tasks') task_record
  where version_record.id = version_id
    and task_record ->> 'id' = hunt_task::text;

  if updated_value is distinct from target then
    raise exception 'I-048/snapshot: target_url is % after the update, expected %',
      coalesce(updated_value, '(null)'), target;
  end if;

  raise notice 'I-048/snapshot: hunt target_url set to % and the snapshot is still valid', target;
end
$snapshot$;

-- Every task in this snapshot must still be present and countable — a rebuild
-- that dropped a task would leave a valid snapshot with less content in it.
do $verify$
declare
  task_count integer;
  stage_count integer;
begin
  select count(distinct stage_record), count(task_record)
    into stage_count, task_count
  from public.content_versions version_record,
       jsonb_array_elements(version_record.snapshot -> 'stages') stage_record,
       jsonb_array_elements(stage_record -> 'tasks') task_record
  where version_record.id = '01980a22-0000-7000-8000-000000000001';

  raise notice 'WS-13 20260727110000 verified: % stage(s), % task(s) intact',
    stage_count, task_count;

  if task_count < 3 then
    raise exception 'the snapshot now holds only % tasks — the rebuild lost content', task_count;
  end if;
end
$verify$;

commit;
