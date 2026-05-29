-- HEDGE — unification du hash chain de hedge_audit_log en CHAÎNE GLOBALE.
-- Ajoute chain_seq bigint monotone pour ordonner la chaîne de façon déterministe
-- (id=gen_random_uuid() non monotone, created_at=now() peut collisionner → non vérifiable).
-- La table est actuellement vide ⇒ backfill trivial, pas de ligne pivot genesis nécessaire.
--
-- DÉCISION D'ARCHITECTURE : chaîne A-global (une seule séquence pour tous les
-- tenants + events globaux tenant=NULL intercalés). Un auditeur externe relit la
-- table ORDER BY chain_seq ASC, recompute compute_audit_row_hash() par ligne et
-- vérifie row_hash == recomputé ET prev_hash == row_hash(chain_seq-1).
--
-- LIGNE DE RUPTURE : les row_hash écrits AVANT cette migration par les 2 anciens
-- schémas divergents (per-tenant côté reconcile, prev_hash=null en dur côté
-- signature_failure) NE sont PAS recomputables. Ici la table est vide donc ce
-- point est théorique ; la première écriture post-migration est le genesis
-- (prev_hash NULL, chain_seq=1).

ALTER TABLE public.hedge_audit_log ADD COLUMN IF NOT EXISTS chain_seq bigint;

-- Backfill déterministe des lignes existantes (ordre created_at, id).
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.hedge_audit_log
)
UPDATE public.hedge_audit_log a
SET chain_seq = o.rn
FROM ordered o
WHERE a.id = o.id AND a.chain_seq IS NULL;

ALTER TABLE public.hedge_audit_log ALTER COLUMN chain_seq SET NOT NULL;

ALTER TABLE public.hedge_audit_log
  ADD CONSTRAINT uq_hedge_audit_log_chain_seq UNIQUE (chain_seq);

CREATE INDEX IF NOT EXISTS idx_hedge_audit_log_chain_seq
  ON public.hedge_audit_log (chain_seq DESC);

COMMENT ON COLUMN public.hedge_audit_log.chain_seq IS
  'Séquence monotone GLOBALE (tous tenants + tenant=NULL). Ordonne la chaîne de hash de façon déterministe. Allouée prev_seq+1 sous pg_advisory_xact_lock(hashtext(''hedge_audit_log_chain'')). Incluse dans le payload hashé (compute_audit_row_hash).';
