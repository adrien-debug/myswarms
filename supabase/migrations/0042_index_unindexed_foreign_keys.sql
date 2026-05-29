-- 0042 — Ajout des index manquants sur 8 foreign keys.
-- Détecté via Supabase performance advisors (unindexed_foreign_keys).
-- Impact : élimine les seq scans implicites lors des cascades ON DELETE
-- et accélère les jointures côté tables enfant.
-- CREATE INDEX IF NOT EXISTS : idempotent, safe à rejouer.
-- Pas de CONCURRENTLY car les migrations Supabase tournent en transaction.

create index if not exists idx_crews_owner_id
  on public.crews(owner_id);

create index if not exists idx_hedge_exec_orders_outbox_decision_id
  on public.hedge_exec_orders_outbox(decision_id);

create index if not exists idx_hedge_execution_reports_decision_id
  on public.hedge_execution_reports(decision_id);

create index if not exists idx_hedge_risk_decisions_portfolio_snapshot_id
  on public.hedge_risk_decisions(portfolio_snapshot_id);

create index if not exists idx_hedge_risk_decisions_risk_profile_id
  on public.hedge_risk_decisions(risk_profile_id);

create index if not exists idx_hedge_risk_decisions_spec_id
  on public.hedge_risk_decisions(spec_id);

create index if not exists idx_sessions_user_id
  on public.sessions(user_id);

create index if not exists idx_swarm_run_steps_task_id
  on public.swarm_run_steps(task_id);
