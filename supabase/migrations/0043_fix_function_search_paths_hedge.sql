-- 0043 — Verrouille search_path pour 7 fonctions flaggées par Supabase
-- security advisors (function_search_path_mutable).
-- Pattern retenu : SET search_path = pg_catalog, public.
--   pg_catalog en premier = builtins (now(), to_jsonb(), encode(), etc.)
--   public ensuite = nos fonctions custom (hedge_canonical_json, etc.)
-- Le pattern SET search_path = '' est plus strict mais exigerait de
-- préfixer pg_catalog.* tous les appels builtins dans le corps, ce qui
-- impacte les fonctions hedge_chain_hash / hedge_canonical_json existantes.

alter function public.set_updated_at()
  set search_path = pg_catalog, public;

alter function public.hedge_canonical_json(payload jsonb)
  set search_path = pg_catalog, public;

alter function public.hedge_chain_hash(prev_hash text, payload jsonb)
  set search_path = pg_catalog, public;

alter function public.hedge_block_mutation()
  set search_path = pg_catalog, public;

alter function public.hedge_run_jobs_touch()
  set search_path = pg_catalog, public;

alter function public.hedge_exec_outbox_touch()
  set search_path = pg_catalog, public;

alter function public.hedge_is_blocked(p_tenant uuid, p_venue text)
  set search_path = pg_catalog, public;
