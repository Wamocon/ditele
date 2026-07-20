-- Seed identities are inserted before their explicit role assignments. Remove
-- automatic learner grants from elevated fixture accounts only.
delete from public.user_roles assignment
using public.roles role_row
where assignment.role_id = role_row.id
  and role_row.code = 'learner'
  and assignment.reason = 'standalone self-registration'
  and assignment.user_id in (
    '01980a00-0000-7000-8000-000000000002',
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000004'
  );

