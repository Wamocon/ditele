-- Forward-only local development overlay for the deterministic role accounts.
-- These credentials are intentionally weak and MUST NOT be used outside the
-- project-local Supabase stack.
-- The bootstrap password documented in seed.sql is deliberately replaced here;
-- this final seed file and README are the source of truth for local sign-in.

do $$
declare
  updated_accounts integer;
begin
  update auth.users as account
  set encrypted_password = extensions.crypt(
        '123123123',
        extensions.gen_salt('bf')
      ),
      updated_at = statement_timestamp()
  where (account.id, account.email) in (
    ('01980a00-0000-7000-8000-000000000001'::uuid, 'learner@ditele.local'),
    ('01980a00-0000-7000-8000-000000000002'::uuid, 'trainer@ditele.local'),
    ('01980a00-0000-7000-8000-000000000003'::uuid, 'admin@ditele.local'),
    ('01980a00-0000-7000-8000-000000000004'::uuid, 'org-admin@ditele.local')
  );

  get diagnostics updated_accounts = row_count;
  if updated_accounts <> 4 then
    raise exception
      'expected four deterministic role accounts, updated %',
      updated_accounts;
  end if;
end;
$$;
