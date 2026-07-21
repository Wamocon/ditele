-- ═══════════════════════════════════════════════════════════════════════════
-- Profile avatars.
--
-- public.profiles has carried an `avatar_object_key` column since the original
-- schema, but no storage bucket ever existed to point it at — only
-- `task-evidence-private`. So a profile photo was unbuildable, not merely
-- unbuilt.
--
-- Also adds update_own_avatar: `profiles` refuses direct UPDATE even for an
-- admin, and update_own_profile's signature does not include the avatar. Rather
-- than change that function's arguments — several forms already post to it —
-- the avatar gets its own narrow SECURITY DEFINER write.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Bucket ─────────────────────────────────────────────────────────────
-- Public-read: an avatar is shown in the header on every page and beside every
-- question and review. Signing a URL per render would mean a storage round trip
-- on every request for a picture the user chose to display. Nothing private
-- goes in here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,                                            -- 2 MB is plenty for a face
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. Policies ───────────────────────────────────────────────────────────
-- Objects are keyed `<user_id>/<filename>`, so the first path segment is the
-- owner. That is what confines a write to your own avatar.

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ─── 3. Narrow write for the avatar key ────────────────────────────────────
-- Own row only. No expected-version argument on purpose: replacing your picture
-- is not a concurrent-edit hazard the way renaming and re-localising a profile
-- in one form is, and forcing the caller to hold a row_version would make the
-- upload flow fight the profile form for no benefit.

create or replace function public.update_own_avatar(p_avatar_object_key text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Null clears the picture and falls the UI back to initials.
  if p_avatar_object_key is not null
     and p_avatar_object_key !~ ('^' || (select auth.uid())::text || '/') then
    raise exception 'avatar key must live under the caller''s own folder'
      using errcode = '22023';
  end if;

  update public.profiles
     set avatar_object_key = p_avatar_object_key,
         updated_at = statement_timestamp(),
         row_version = row_version + 1
   where user_id = (select auth.uid())
  returning * into updated_row;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  return updated_row;
end;
$$;

comment on function public.update_own_avatar is
  'Sets or clears the caller''s own avatar_object_key. The key must sit under '
  'the caller''s user id folder, matching the storage policy.';

grant execute on function public.update_own_avatar(text) to authenticated;

commit;
