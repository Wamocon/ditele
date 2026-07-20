-- Product packages may be platform-global or tenant-specific; the nullable scope
-- keeps global catalog plans while enabling tenant-owned private packages.
alter table public.product_packages
  add column organization_id uuid references public.organizations(id) on delete restrict;

create index product_packages_organization_state_idx
  on public.product_packages (organization_id, state, code);
