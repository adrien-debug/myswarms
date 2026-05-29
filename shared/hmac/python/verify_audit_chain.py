"""Vérificateur exécutable de la chaîne de hash globale `hedge_audit_log`.

Rend le contrat de recompute EXÉCUTABLE (et non plus seulement documenté dans
le docstring de compute_audit_row_hash). Deux usages :

1. Audit a posteriori — pointer `verify_chain()` sur un dump des lignes de la
   table (ORDER BY chain_seq ASC) pour confirmer :
     - row_hash[i] == compute_audit_row_hash(<colonnes de la ligne i>)
     - prev_hash[i] == row_hash[i-1]  (chaînage)
     - chain_seq strictement monotone (+1, pas de trou ni de doublon)

   Dump SQL côté auditeur :
     select chain_seq, prev_hash, tenant_id, actor_kind, event_type, severity,
            source_service, request_id, details, row_hash
     from public.hedge_audit_log order by chain_seq asc;

2. Test de non-régression — `python verify_audit_chain.py` (ou pytest) rejoue
   une chaîne synthétique (genesis + events tenant/global intercalés) et prouve
   déterminisme + chaînage. Sortie code 0 si OK, 1 sinon.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from hedge_hmac import compute_audit_row_hash


def _row_hash_from_columns(row: Mapping[str, Any]) -> str:
    """Recompute le row_hash d'UNE ligne à partir de ses colonnes persistées.

    `row` doit exposer exactement les colonnes du dump SQL ci-dessus. tenant_id /
    request_id peuvent être None (event global / sans corrélation) ; details est
    le jsonb (dict). Les chaînes vides "" en DB côté prev_hash sont normalisées
    par compute_audit_row_hash (prev_hash or "").
    """
    return compute_audit_row_hash(
        chain_seq=int(row["chain_seq"]),
        prev_hash=row.get("prev_hash"),
        tenant_id=row.get("tenant_id"),
        actor_kind=row["actor_kind"],
        event_type=row["event_type"],
        severity=row["severity"],
        source_service=row.get("source_service"),
        request_id=row.get("request_id"),
        details=row.get("details") or {},
    )


def verify_chain(rows: Iterable[Mapping[str, Any]]) -> list[str]:
    """Vérifie une chaîne complète. Retourne la liste des violations (vide = OK).

    `rows` doit être trié par chain_seq ASC. Vérifie : monotonie stricte (+1) de
    chain_seq, recompute de chaque row_hash, et continuité prev_hash[i]==row_hash[i-1]
    (la genesis a prev_hash NULL/"").
    """
    violations: list[str] = []
    prev_seq: int | None = None
    prev_row_hash: str | None = None

    for row in rows:
        seq = int(row["chain_seq"])
        # 1. Monotonie stricte.
        if prev_seq is not None and seq != prev_seq + 1:
            violations.append(f"chain_seq gap/dup: {prev_seq} -> {seq}")
        # 2. Recompute du row_hash.
        recomputed = _row_hash_from_columns(row)
        if recomputed != row["row_hash"]:
            violations.append(
                f"row_hash mismatch at chain_seq={seq}: "
                f"stored={row['row_hash'][:16]}… recomputed={recomputed[:16]}…"
            )
        # 3. Continuité du chaînage.
        stored_prev = row.get("prev_hash") or None
        if prev_row_hash is None:
            # Genesis : prev_hash doit être NULL/"".
            if stored_prev is not None:
                violations.append(f"genesis chain_seq={seq} has non-null prev_hash")
        elif stored_prev != prev_row_hash:
            violations.append(
                f"chain break at chain_seq={seq}: prev_hash != row_hash(seq-1)"
            )
        prev_seq = seq
        prev_row_hash = row["row_hash"]

    return violations


# --------------------------------------------------------------------------- #
# Test de non-régression : chaîne synthétique reproduisant les 2 call-sites.
# --------------------------------------------------------------------------- #
def _build_reference_chain() -> list[dict[str, Any]]:
    """Reconstruit une chaîne comme le feraient repo.py + reconcile_worker.py,
    avec events tenant et global intercalés (le cas que la chaîne A-globale doit
    gérer sans ambiguïté)."""
    events = [
        # (tenant_id, actor_kind, event_type, source_service, request_id, details)
        ("11111111-1111-1111-1111-111111111111", "service", "signature.invalid",
         "execution-engine", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
         {"outbox_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "reason": "bad sig"}),
        ("22222222-2222-2222-2222-222222222222", "system", "kill_switch.auto_set",
         "execution-engine", None, {"reason": "reconcile_mismatch"}),
        (None, "system", "kill_switch.auto_set",   # event GLOBAL (tenant NULL)
         "execution-engine", None, {"reason": "global_halt"}),
        ("11111111-1111-1111-1111-111111111111", "system", "kill_switch.auto_set",
         "execution-engine", None, {"reason": "reconcile_mismatch"}),
    ]
    chain: list[dict[str, Any]] = []
    prev_hash: str | None = None
    for i, (tid, kind, etype, svc, rid, details) in enumerate(events, start=1):
        rh = compute_audit_row_hash(
            chain_seq=i, prev_hash=prev_hash, tenant_id=tid, actor_kind=kind,
            event_type=etype, severity="critical", source_service=svc,
            request_id=rid, details=details,
        )
        chain.append({
            "chain_seq": i, "prev_hash": prev_hash, "tenant_id": tid,
            "actor_kind": kind, "event_type": etype, "severity": "critical",
            "source_service": svc, "request_id": rid, "details": details,
            "row_hash": rh,
        })
        prev_hash = rh
    return chain


def test_reference_chain_verifies() -> None:
    chain = _build_reference_chain()
    assert verify_chain(chain) == []


def test_determinism() -> None:
    # Même inputs ⇒ même hash, indépendamment de l'ordre des clés de details.
    h1 = compute_audit_row_hash(
        chain_seq=1, prev_hash=None, tenant_id=None, actor_kind="system",
        event_type="x", severity="info", source_service="s", request_id=None,
        details={"a": 1, "b": 2},
    )
    h2 = compute_audit_row_hash(
        chain_seq=1, prev_hash=None, tenant_id=None, actor_kind="system",
        event_type="x", severity="info", source_service="s", request_id=None,
        details={"b": 2, "a": 1},
    )
    assert h1 == h2 and len(h1) == 64


def test_tamper_detected() -> None:
    # Modifier un détail au milieu de la chaîne casse la vérification.
    chain = _build_reference_chain()
    chain[1] = {**chain[1], "details": {"reason": "TAMPERED"}}
    assert verify_chain(chain) != []


def test_chain_break_detected() -> None:
    # Supprimer une ligne (trou de chain_seq) est détecté.
    chain = _build_reference_chain()
    broken = [chain[0], chain[2], chain[3]]  # retire chain_seq=2
    assert verify_chain(broken) != []


if __name__ == "__main__":
    import sys

    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"  ✓ {name}")
    print("OK — chaîne audit recomputable et infalsifiable vérifiée.")
    sys.exit(0)
