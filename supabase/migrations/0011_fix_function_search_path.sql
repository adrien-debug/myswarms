-- 0011_fix_function_search_path.sql
--
-- Hardening complémentaire de 0010 (tâche B).
--
-- L'advisor Supabase `function_search_path_mutable` reste en WARN sur
-- public.check_swarm_tasks_agent_in_swarm() car la fonction a été créée en
-- 0010 sans `SET search_path`. Impact réel négligeable (fonction non
-- SECURITY DEFINER + tables schema-qualifiées), mais le hardening doit être
-- complet et c'est le dernier advisor security non clean.
--
-- On recrée la fonction à l'identique (corps métier INCHANGÉ) en ajoutant
-- `SET search_path = pg_catalog, public`, aligné sur le pattern déjà durci
-- de set_updated_at. CREATE OR REPLACE suffit : le trigger
-- swarm_tasks_agent_in_swarm (défini en 0010) référence la fonction par nom
-- et continue de pointer dessus sans recréation. Idempotent.

create or replace function public.check_swarm_tasks_agent_in_swarm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.agent_id is not null then
    if not exists (
      select 1 from public.swarm_agents sa
      where sa.id = new.agent_id and sa.swarm_id = new.swarm_id
    ) then
      raise exception 'swarm_tasks.agent_id % does not belong to swarm %', new.agent_id, new.swarm_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
