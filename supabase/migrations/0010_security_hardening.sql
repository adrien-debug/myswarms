-- 0010_security_hardening.sql
--
-- Security & data-integrity hardening pass — corrige plusieurs trous P0/P1
-- identifiés par l'audit RLS post-0009. Idempotent (peut être rejoué).
--
-- Tâches :
--   A. swarm_tool_bindings : cross-check ownership tools ↔ swarm (P0)
--      → empêche d'attacher à un swarm un tool qui appartient à un autre user.
--   B. swarm_tasks : trigger BEFORE INS/UPD garantissant que `agent_id` (si
--      non-null) appartient au même swarm que la task (P0). Suite à la
--      relaxation NOT NULL de 0009, rien ne validait l'appartenance.
--   C. audit_template_access : table d'audit pour tracer view/fork/use d'un
--      template swarm (P0/P1).
--   D. Indexes perf manquants sur swarms.created_at et swarm_runs(status,
--      started_at) (P1).
--   E. swarm_run_steps.status : passe de text libre à crew_run_status (ENUM
--      défini en 0002), avec normalisation préalable des valeurs out-of-range.
--
-- Notes :
--   - Aucune action destructive sur les données existantes (sauf normalisation
--     soft des status invalides en 'pending' avant le cast d'enum).
--   - Toutes les nouvelles policies sont scopées par owner / user_id.

-- =====================================================================
-- Tâche A — Cross-check ownership tools ↔ swarm_tool_bindings (P0)
-- =====================================================================
-- La policy existante ne vérifiait que swarms.owner_id = auth.uid(),
-- pas tools.owner_id. Un user pouvait binder un tool d'un autre user
-- (info disclosure + abuse potentiel). On ajoute le check croisé, en
-- autorisant aussi tools.owner_id IS NULL (templates partagés V1).

-- Pré-check : recense les bindings cross-owner existants — ils perdront leur
-- accès en écriture une fois la policy resserrée. Pas de blocage : on émet
-- juste un RAISE WARNING pour que l'opérateur puisse les auditer avant
-- d'appliquer la migration (ou nettoyer ensuite via DELETE manuel).
do $$
declare
  v_orphan_count int;
begin
  select count(*) into v_orphan_count
  from public.swarm_tool_bindings stb
  join public.swarms s on s.id = stb.swarm_id
  join public.tools  t on t.id = stb.tool_id
  where s.owner_id is distinct from t.owner_id
    and t.owner_id is not null;
  if v_orphan_count > 0 then
    raise warning '[0010 task A] % cross-owner swarm_tool_bindings will lose write access after policy update — review needed', v_orphan_count;
  end if;
end$$;

drop policy if exists "swarm_tool_bindings_owner_all" on public.swarm_tool_bindings;

create policy "swarm_tool_bindings_owner_all"
  on public.swarm_tool_bindings
  for all
  using (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_tool_bindings.swarm_id and s.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.tools t
      where t.id = swarm_tool_bindings.tool_id
        and (t.owner_id = auth.uid() or t.owner_id is null)
    )
  )
  with check (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_tool_bindings.swarm_id and s.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.tools t
      where t.id = swarm_tool_bindings.tool_id
        and (t.owner_id = auth.uid() or t.owner_id is null)
    )
  );

-- =====================================================================
-- Tâche B — Trigger : swarm_tasks.agent_id doit appartenir au swarm (P0)
-- =====================================================================
-- Depuis 0009, swarm_tasks.agent_id est nullable + ON DELETE SET NULL.
-- Mais si non-null, rien ne garantissait qu'il pointe vers un agent du
-- même swarm. Trigger BEFORE INSERT OR UPDATE pour valider.

create or replace function public.check_swarm_tasks_agent_in_swarm()
returns trigger
language plpgsql
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

drop trigger if exists swarm_tasks_agent_in_swarm on public.swarm_tasks;
create trigger swarm_tasks_agent_in_swarm
  before insert or update on public.swarm_tasks
  for each row execute function public.check_swarm_tasks_agent_in_swarm();

-- =====================================================================
-- Tâche C — Audit log pour template access (P0/P1)
-- =====================================================================
-- Trace view/fork/use des swarms publiés en template. Permet de détecter
-- des patterns abusifs (scraping massif, fork-bomb d'un template).

-- template_id : ON DELETE SET NULL (et non CASCADE) pour préserver
-- l'historique d'audit même si le template d'origine est supprimé. On capture
-- aussi `template_name_snapshot` au moment de l'audit pour conserver une
-- trace lisible (cf. P1 review : un CASCADE faisait disparaître toute la
-- timeline d'accès du jour où un user supprimait son template).
create table if not exists public.audit_template_access (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete set null,
  template_id             uuid references public.swarms(id) on delete set null,
  template_name_snapshot  text,
  action                  text not null check (action in ('view', 'fork', 'use')),
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now()
);

create index if not exists audit_template_access_user_id_idx     on public.audit_template_access(user_id);
create index if not exists audit_template_access_template_id_idx on public.audit_template_access(template_id);
create index if not exists audit_template_access_created_at_idx  on public.audit_template_access(created_at desc);

alter table public.audit_template_access enable row level security;

drop policy if exists "audit_template_access_owner_read" on public.audit_template_access;
create policy "audit_template_access_owner_read"
  on public.audit_template_access
  for select
  using (user_id = auth.uid());

drop policy if exists "audit_template_access_owner_insert" on public.audit_template_access;
create policy "audit_template_access_owner_insert"
  on public.audit_template_access
  for insert
  with check (user_id = auth.uid());

-- =====================================================================
-- Tâche D — Indexes perf manquants (P1)
-- =====================================================================
-- swarms_created_at_idx : tri par récence (dashboard "mes derniers swarms").
-- swarm_runs_status_started_at_idx : composite pour les listings "runs en
-- cours" / "derniers runs failed", évite un scan + sort.

create index if not exists swarms_created_at_idx
  on public.swarms(created_at desc);

create index if not exists swarm_runs_status_started_at_idx
  on public.swarm_runs(status, started_at desc);

-- =====================================================================
-- Tâche E — ENUM pour swarm_run_steps.status (P1)
-- =====================================================================
-- crew_run_status est défini en 0002 ('pending', 'running', 'paused_hitl',
-- 'completed', 'failed', 'cancelled'). On migre swarm_run_steps.status
-- (text libre) vers cet enum. Étape de normalisation : toute valeur null
-- ou hors-enum est ramenée à 'pending' avant le cast.

update public.swarm_run_steps
set status = 'pending'
where status is null
   or status not in ('pending', 'running', 'paused_hitl', 'completed', 'failed', 'cancelled');

alter table public.swarm_run_steps
  alter column status type public.crew_run_status using status::public.crew_run_status;

alter table public.swarm_run_steps
  alter column status set default 'pending';

alter table public.swarm_run_steps
  alter column status set not null;
