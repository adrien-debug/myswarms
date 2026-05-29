-- Migration 0046 — Deux correctifs RLS
--
-- PARTIE 1 : initplan (auth_rls_initplan — 24 policies)
--   Problème : auth.uid() / auth.jwt() / auth.role() appelés directement dans les prédicats RLS
--   sont ré-évalués pour CHAQUE ligne (init-plan par ligne).
--   Correction : wrapper en (select auth.uid()) etc. → Postgres évalue la fonction UNE seule fois
--   par statement (init-plan au niveau query), gain significatif sur les grandes tables.
--   ALTER POLICY est idempotent : re-jouer la migration ne casse rien.
--
-- PARTIE 2 : dédup permissive (multiple_permissive_policies — 14 tables hedge_*)
--   Problème : chaque table hedge_* possède deux policies permissives strictement identiques
--   (_service_all et _service_v2 : ALL / service_role / qual=true / with_check=true).
--   Conserver _service_all, supprimer _service_v2.
--   DROP POLICY IF EXISTS est idempotent.

-- ============================================================
-- PARTIE 1 — Réécriture initplan (23 ALTER POLICY)
-- ============================================================

-- 1. audit_template_access — SELECT, pas de with_check
ALTER POLICY "audit_template_access_owner_read"
  ON public.audit_template_access
  USING ((user_id = (select auth.uid())));

-- 2. chief_decisions — SELECT, pas de with_check
ALTER POLICY "chief_decisions owner select"
  ON public.chief_decisions
  USING ((owner_id = (select auth.uid())));

-- 3. chief_decisions — UPDATE, with_check
ALTER POLICY "chief_decisions owner update"
  ON public.chief_decisions
  USING ((owner_id = (select auth.uid())))
  WITH CHECK ((owner_id = (select auth.uid())));

-- 4. chief_run_log — SELECT, pas de with_check
ALTER POLICY "chief_run_log owner select"
  ON public.chief_run_log
  USING ((owner_id = (select auth.uid())));

-- 5. chief_run_log — UPDATE, with_check
ALTER POLICY "chief_run_log owner update"
  ON public.chief_run_log
  USING ((owner_id = (select auth.uid())))
  WITH CHECK ((owner_id = (select auth.uid())));

-- 6. chief_run_steps — SELECT, pas de with_check
ALTER POLICY "chief_run_steps owner select"
  ON public.chief_run_steps
  USING ((owner_id = (select auth.uid())));

-- 7. chief_run_steps — UPDATE, with_check
ALTER POLICY "chief_run_steps owner update"
  ON public.chief_run_steps
  USING ((owner_id = (select auth.uid())))
  WITH CHECK ((owner_id = (select auth.uid())));

-- 8. cockpit_chats — ALL, pas de with_check
ALTER POLICY "own chats"
  ON public.cockpit_chats
  USING (((select auth.uid()) = user_id));

-- 9. cockpit_messages — ALL, pas de with_check (EXISTS imbriqué)
ALTER POLICY "own messages"
  ON public.cockpit_messages
  USING ((EXISTS ( SELECT 1
    FROM cockpit_chats c
    WHERE ((c.id = cockpit_messages.chat_id) AND (c.user_id = (select auth.uid()))))));

-- 10. crew_run_steps — ALL, with_check = qual (EXISTS double JOIN)
ALTER POLICY "crew_run_steps_owner_all"
  ON public.crew_run_steps
  USING ((EXISTS ( SELECT 1
    FROM (crew_runs r
    JOIN crews c ON ((c.id = r.crew_id)))
    WHERE ((r.id = crew_run_steps.run_id) AND (c.owner_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM (crew_runs r
    JOIN crews c ON ((c.id = r.crew_id)))
    WHERE ((r.id = crew_run_steps.run_id) AND (c.owner_id = (select auth.uid()))))));

-- 11. crew_runs — ALL, with_check = qual (EXISTS simple)
ALTER POLICY "crew_runs_owner_all"
  ON public.crew_runs
  USING ((EXISTS ( SELECT 1
    FROM crews c
    WHERE ((c.id = crew_runs.crew_id) AND (c.owner_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM crews c
    WHERE ((c.id = crew_runs.crew_id) AND (c.owner_id = (select auth.uid()))))));

-- 12. crews — ALL, with_check
ALTER POLICY "crews_owner_all"
  ON public.crews
  USING (((select auth.uid()) = owner_id))
  WITH CHECK (((select auth.uid()) = owner_id));

-- 13. flow_states — ALL, with_check = qual (EXISTS double JOIN)
ALTER POLICY "flow_states_owner_all"
  ON public.flow_states
  USING ((EXISTS ( SELECT 1
    FROM (crew_runs r
    JOIN crews c ON ((c.id = r.crew_id)))
    WHERE ((r.id = flow_states.run_id) AND (c.owner_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM (crew_runs r
    JOIN crews c ON ((c.id = r.crew_id)))
    WHERE ((r.id = flow_states.run_id) AND (c.owner_id = (select auth.uid()))))));

-- 14. sessions — ALL, pas de with_check
ALTER POLICY "sessions: own data"
  ON public.sessions
  USING (((select auth.uid()) = user_id));

-- 15. swarm_agents — ALL, with_check = qual (EXISTS simple)
ALTER POLICY "swarm_agents_owner_all"
  ON public.swarm_agents
  USING ((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_agents.swarm_id) AND (s.owner_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_agents.swarm_id) AND (s.owner_id = (select auth.uid()))))));

-- 16. swarm_run_steps — ALL, with_check = qual (EXISTS double JOIN)
ALTER POLICY "swarm_run_steps_owner_all"
  ON public.swarm_run_steps
  USING ((EXISTS ( SELECT 1
    FROM (swarm_runs r
    JOIN swarms s ON ((s.id = r.swarm_id)))
    WHERE ((r.id = swarm_run_steps.run_id) AND (s.owner_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM (swarm_runs r
    JOIN swarms s ON ((s.id = r.swarm_id)))
    WHERE ((r.id = swarm_run_steps.run_id) AND (s.owner_id = (select auth.uid()))))));

-- 17. swarm_runs — ALL, with_check = qual (EXISTS simple)
ALTER POLICY "swarm_runs_owner_all"
  ON public.swarm_runs
  USING ((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_runs.swarm_id) AND (s.owner_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_runs.swarm_id) AND (s.owner_id = (select auth.uid()))))));

-- 18. swarm_tasks — ALL, with_check = qual (EXISTS simple)
ALTER POLICY "swarm_tasks_owner_all"
  ON public.swarm_tasks
  USING ((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_tasks.swarm_id) AND (s.owner_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_tasks.swarm_id) AND (s.owner_id = (select auth.uid()))))));

-- 19. swarm_tool_bindings — ALL, with_check = qual (EXISTS double : swarms + tools)
ALTER POLICY "swarm_tool_bindings_owner_all"
  ON public.swarm_tool_bindings
  USING (((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_tool_bindings.swarm_id) AND (s.owner_id = (select auth.uid())))))
    AND (EXISTS ( SELECT 1
    FROM tools t
    WHERE ((t.id = swarm_tool_bindings.tool_id) AND ((t.owner_id = (select auth.uid())) OR (t.owner_id IS NULL)))))))
  WITH CHECK (((EXISTS ( SELECT 1
    FROM swarms s
    WHERE ((s.id = swarm_tool_bindings.swarm_id) AND (s.owner_id = (select auth.uid())))))
    AND (EXISTS ( SELECT 1
    FROM tools t
    WHERE ((t.id = swarm_tool_bindings.tool_id) AND ((t.owner_id = (select auth.uid())) OR (t.owner_id IS NULL)))))));

-- 20. swarms — ALL, with_check
ALTER POLICY "swarms_owner_all"
  ON public.swarms
  USING (((select auth.uid()) = owner_id))
  WITH CHECK (((select auth.uid()) = owner_id));

-- 21. tools — ALL, with_check
ALTER POLICY "tools_owner_all"
  ON public.tools
  USING (((select auth.uid()) = owner_id))
  WITH CHECK (((select auth.uid()) = owner_id));

-- 22. users — ALL, pas de with_check
ALTER POLICY "users: own data"
  ON public.users
  USING (((select auth.uid()) = id));

-- 23. webhook_endpoints — ALL, with_check (auth.role)
ALTER POLICY "service_role_full_access"
  ON public.webhook_endpoints
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

-- 24-27. Policies INSERT (with_check uniquement, pas de USING) — même correctif initplan.
ALTER POLICY "audit_template_access_owner_insert"
  ON public.audit_template_access
  WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "chief_decisions owner insert"
  ON public.chief_decisions
  WITH CHECK ((owner_id = (select auth.uid())));

ALTER POLICY "chief_run_log owner insert"
  ON public.chief_run_log
  WITH CHECK ((owner_id = (select auth.uid())));

ALTER POLICY "chief_run_steps owner insert"
  ON public.chief_run_steps
  WITH CHECK ((owner_id = (select auth.uid())));

-- NOTE multiple_permissive restant (swarms/swarm_agents/swarm_tasks, role *, SELECT) :
-- les paires {*_owner_all (ALL), *_templates_readable (SELECT sur templates publics
-- is_template=true AND owner_id IS NULL)} ne sont PAS des doublons — deux intentions
-- distinctes (mes lignes vs templates publics). Non fusionnées : un ALL et un SELECT ne
-- se combinent pas sans dégrader la sémantique, pour un WARN perf mineur sur des tables
-- à faible cardinalité. Laissé volontairement.
--
-- NOTE unused_index : 34 index signalés "unused" reflètent l'absence de trafic (DB de
-- trading naissante, hedge_* vides). Aucun drop ici — un index "unused" aujourd'hui sert
-- des FK / requêtes rares dès la mise en charge. À ré-auditer après trafic réel de prod.

-- ============================================================
-- PARTIE 2 — Suppression des policies permissives en doublon (14 DROP)
-- ============================================================

DROP POLICY IF EXISTS "hedge_audit_log_service_v2"              ON public.hedge_audit_log;
DROP POLICY IF EXISTS "hedge_exec_orders_outbox_service_v2"     ON public.hedge_exec_orders_outbox;
DROP POLICY IF EXISTS "hedge_execution_alerts_service_v2"       ON public.hedge_execution_alerts;
DROP POLICY IF EXISTS "hedge_execution_reports_service_v2"      ON public.hedge_execution_reports;
DROP POLICY IF EXISTS "hedge_kill_switches_service_v2"          ON public.hedge_kill_switches;
DROP POLICY IF EXISTS "hedge_portfolio_snapshots_service_v2"    ON public.hedge_portfolio_snapshots;
DROP POLICY IF EXISTS "hedge_position_reconciliations_service_v2" ON public.hedge_position_reconciliations;
DROP POLICY IF EXISTS "hedge_risk_decisions_service_v2"         ON public.hedge_risk_decisions;
DROP POLICY IF EXISTS "hedge_run_events_service_v2"             ON public.hedge_run_events;
DROP POLICY IF EXISTS "hedge_run_jobs_service_v2"               ON public.hedge_run_jobs;
DROP POLICY IF EXISTS "hedge_strategy_requests_service_v2"      ON public.hedge_strategy_requests;
DROP POLICY IF EXISTS "hedge_strategy_specs_service_v2"         ON public.hedge_strategy_specs;
DROP POLICY IF EXISTS "hedge_swarm_signals_service_v2"          ON public.hedge_swarm_signals;
DROP POLICY IF EXISTS "hedge_tenant_risk_profiles_service_v2"   ON public.hedge_tenant_risk_profiles;
