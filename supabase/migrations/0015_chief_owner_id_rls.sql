-- 0015_chief_owner_id_rls.sql
--
-- Scoping owner_id sur les 3 tables Chief of Staff + RLS multi-user.
--
-- Contexte :
--   - chief_run_log, chief_run_steps, chief_decisions n'avaient pas owner_id.
--   - RLS était déjà activée (0005 + 0014) mais en single-user (service_role seul).
--   - Cette migration bascule vers multi-user : authenticated lit/écrit SES runs.
--   - service_role conserve l'accès complet (engine Python — pattern calqué sur 0014).
--   - owner_id NULLABLE intentionnel : ne jamais casser une insertion engine transitoire
--     (si l'engine n'envoie pas encore owner_id, la ligne est insérée sans filtrage user).
--   - Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Backfill : 30 lignes existantes dans chief_run_log → propriétaire DEV_OWNER_ID.
--   chief_run_steps et chief_decisions sont vides (0 ligne) — UPDATE idempotent.

-- =====================================================================
-- 1. Ajout de la colonne owner_id
-- =====================================================================

ALTER TABLE public.chief_run_log
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

ALTER TABLE public.chief_run_steps
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

ALTER TABLE public.chief_decisions
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- =====================================================================
-- 2. Backfill (DEV_OWNER_ID inliné — UUID d'identité, non secret)
-- =====================================================================

UPDATE public.chief_run_log
  SET owner_id = 'e0a983da-536f-4dad-a205-861acbae9468'::uuid
  WHERE owner_id IS NULL;

UPDATE public.chief_run_steps
  SET owner_id = 'e0a983da-536f-4dad-a205-861acbae9468'::uuid
  WHERE owner_id IS NULL;

UPDATE public.chief_decisions
  SET owner_id = 'e0a983da-536f-4dad-a205-861acbae9468'::uuid
  WHERE owner_id IS NULL;

-- =====================================================================
-- 3. Index de performance sur owner_id
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_chief_run_log_owner
  ON public.chief_run_log(owner_id);

CREATE INDEX IF NOT EXISTS idx_chief_run_steps_owner
  ON public.chief_run_steps(owner_id);

CREATE INDEX IF NOT EXISTS idx_chief_decisions_owner
  ON public.chief_decisions(owner_id);

-- =====================================================================
-- 4. RLS policies — pattern calqué sur 0014 (service_role full access
--    via explicit policy) + ajout policies authenticated scopées owner_id.
-- =====================================================================

-- ---- chief_run_log ----

-- Supprimer la policy restrictive single-user héritée de 0005 (deny_all_non_service)
DROP POLICY IF EXISTS "deny_all_non_service" ON public.chief_run_log;

-- service_role : accès complet (engine Python — write sans token utilisateur)
DROP POLICY IF EXISTS "chief_run_log service_role full access" ON public.chief_run_log;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_log'
      AND policyname = 'chief_run_log service_role full access'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_run_log service_role full access"
        ON public.chief_run_log FOR ALL
        TO service_role USING (true) WITH CHECK (true)
    $p$;
  END IF;
END$$;

-- authenticated : SELECT uniquement ses propres runs
DROP POLICY IF EXISTS "chief_run_log owner select" ON public.chief_run_log;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_log'
      AND policyname = 'chief_run_log owner select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_run_log owner select"
        ON public.chief_run_log FOR SELECT
        TO authenticated
        USING (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- authenticated : INSERT avec owner_id = soi-même
DROP POLICY IF EXISTS "chief_run_log owner insert" ON public.chief_run_log;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_log'
      AND policyname = 'chief_run_log owner insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_run_log owner insert"
        ON public.chief_run_log FOR INSERT
        TO authenticated
        WITH CHECK (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- authenticated : UPDATE sur ses propres runs
DROP POLICY IF EXISTS "chief_run_log owner update" ON public.chief_run_log;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_log'
      AND policyname = 'chief_run_log owner update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_run_log owner update"
        ON public.chief_run_log FOR UPDATE
        TO authenticated
        USING (owner_id = auth.uid())
        WITH CHECK (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- ---- chief_run_steps ----

-- service_role : accès complet (pattern 0014)
DROP POLICY IF EXISTS "service_role full access steps" ON public.chief_run_steps;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_steps'
      AND policyname = 'service_role full access steps'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "service_role full access steps"
        ON public.chief_run_steps FOR ALL
        TO service_role USING (true) WITH CHECK (true)
    $p$;
  END IF;
END$$;

-- authenticated : SELECT
DROP POLICY IF EXISTS "chief_run_steps owner select" ON public.chief_run_steps;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_steps'
      AND policyname = 'chief_run_steps owner select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_run_steps owner select"
        ON public.chief_run_steps FOR SELECT
        TO authenticated
        USING (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- authenticated : INSERT
DROP POLICY IF EXISTS "chief_run_steps owner insert" ON public.chief_run_steps;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_steps'
      AND policyname = 'chief_run_steps owner insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_run_steps owner insert"
        ON public.chief_run_steps FOR INSERT
        TO authenticated
        WITH CHECK (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- authenticated : UPDATE
DROP POLICY IF EXISTS "chief_run_steps owner update" ON public.chief_run_steps;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_run_steps'
      AND policyname = 'chief_run_steps owner update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_run_steps owner update"
        ON public.chief_run_steps FOR UPDATE
        TO authenticated
        USING (owner_id = auth.uid())
        WITH CHECK (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- ---- chief_decisions ----

-- service_role : accès complet (pattern 0014)
DROP POLICY IF EXISTS "service_role full access decisions" ON public.chief_decisions;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_decisions'
      AND policyname = 'service_role full access decisions'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "service_role full access decisions"
        ON public.chief_decisions FOR ALL
        TO service_role USING (true) WITH CHECK (true)
    $p$;
  END IF;
END$$;

-- authenticated : SELECT
DROP POLICY IF EXISTS "chief_decisions owner select" ON public.chief_decisions;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_decisions'
      AND policyname = 'chief_decisions owner select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_decisions owner select"
        ON public.chief_decisions FOR SELECT
        TO authenticated
        USING (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- authenticated : INSERT
DROP POLICY IF EXISTS "chief_decisions owner insert" ON public.chief_decisions;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_decisions'
      AND policyname = 'chief_decisions owner insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_decisions owner insert"
        ON public.chief_decisions FOR INSERT
        TO authenticated
        WITH CHECK (owner_id = auth.uid())
    $p$;
  END IF;
END$$;

-- authenticated : UPDATE
DROP POLICY IF EXISTS "chief_decisions owner update" ON public.chief_decisions;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chief_decisions'
      AND policyname = 'chief_decisions owner update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "chief_decisions owner update"
        ON public.chief_decisions FOR UPDATE
        TO authenticated
        USING (owner_id = auth.uid())
        WITH CHECK (owner_id = auth.uid())
    $p$;
  END IF;
END$$;
