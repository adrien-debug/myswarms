-- 0005_chief_run_log_rls.sql
-- Enable RLS on chief_run_log (intentionally omitted in 0004 — corrected here).
-- This table is written exclusively by the backend service role (never by browser clients).
-- Service role bypasses RLS by default; this policy ensures anon/user roles cannot read
-- or write run logs directly.

ALTER TABLE public.chief_run_log ENABLE ROW LEVEL SECURITY;

-- No policies granted to anon or authenticated roles.
-- service_role (backend) bypasses RLS automatically — no explicit policy needed for it.
-- For completeness, deny all for clarity (deny is implicit without policy,
-- but being explicit improves readability in the Supabase dashboard).
-- Note: RESTRICTIVE policies apply to specific roles listed in TO clause (anon, authenticated).
-- service_role is NOT restricted — it bypasses RLS automatically in Supabase.
-- The name "deny_all_non_service" describes intent, not mechanism: it doesn't cover all
-- possible future roles — only those explicitly listed.
CREATE POLICY "deny_all_non_service" ON public.chief_run_log
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false);
