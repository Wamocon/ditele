-- Forward corrections discovered while validating the initial migration set.

alter table public.badges add column if not exists row_version bigint not null default 1 check (row_version > 0);
alter table public.missions add column if not exists row_version bigint not null default 1 check (row_version > 0);

create or replace function app_private.reject_published_content_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'published' then
    raise exception 'published content versions are immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.reject_published_content_mutation() from public, anon, authenticated;

