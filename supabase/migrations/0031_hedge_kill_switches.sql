-- HEDGE — kill_switches
-- 3 levels: global, per-tenant, per-venue. Read by Execution on EVERY order.

create table if not exists public.hedge_kill_switches (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','tenant','venue')),
  -- For scope='tenant': tenant_id required, venue null.
  -- For scope='venue':  venue required, tenant_id null.
  -- For scope='global': both null.
  tenant_id uuid,
  venue text,
  active boolean not null default false,
  reason text,
  set_by uuid,
  set_at timestamptz not null default now(),
  cleared_by uuid,
  cleared_at timestamptz,
  -- Enforce shape:
  check (
    (scope = 'global' and tenant_id is null and venue is null)
    or (scope = 'tenant' and tenant_id is not null and venue is null)
    or (scope = 'venue' and tenant_id is null and venue is not null)
  )
);

-- Only one active kill switch per (scope, tenant_id, venue) combination.
create unique index if not exists uniq_kill_switch_global_active
  on public.hedge_kill_switches (scope)
  where scope = 'global' and active = true;

create unique index if not exists uniq_kill_switch_tenant_active
  on public.hedge_kill_switches (tenant_id)
  where scope = 'tenant' and active = true;

create unique index if not exists uniq_kill_switch_venue_active
  on public.hedge_kill_switches (venue)
  where scope = 'venue' and active = true;

alter table public.hedge_kill_switches enable row level security;

-- Tenants can only see their own + global + venue switches.
create policy "hedge_kill_switches_select_visible"
  on public.hedge_kill_switches for select
  to authenticated
  using (
    scope = 'global'
    or (scope = 'venue')
    or (scope = 'tenant' and tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  );

-- Only service_role can mutate (admin endpoint).
create policy "hedge_kill_switches_service_all"
  on public.hedge_kill_switches for all
  to service_role
  using (true) with check (true);

-- Convenience view: is_blocked(tenant_id, venue) -> bool
create or replace function hedge_is_blocked(p_tenant uuid, p_venue text)
returns boolean
language sql
stable
parallel safe
as $$
  select exists (
    select 1 from public.hedge_kill_switches
    where active = true
      and (
        scope = 'global'
        or (scope = 'tenant' and tenant_id = p_tenant)
        or (scope = 'venue' and venue = p_venue)
      )
  );
$$;

comment on function hedge_is_blocked is
  'Returns true if any active kill switch blocks trading for given (tenant, venue).';
