-- 0003_crewai_polish.sql — Fix search_path mutable warning on set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
