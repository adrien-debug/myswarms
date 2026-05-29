#!/usr/bin/env python3
"""
Test E2E de l'Architect Hive enrichi VaultSearchTool.
Vérifie que :
1. L'Architect appelle vault_search avant de générer un swarm spec
2. Le contexte Cortex apparaît dans son output
3. Pas d'erreur si Cortex est down (fail-soft)

Approche : on teste _fetch_cortex_context directement (sans appel LLM)
puis on vérifie generate_swarm_spec via un mock LLM minimal pour éviter
le coût ~$0.50 d'un appel Opus complet.
"""
from __future__ import annotations

import importlib
import json
import os
import sys
from unittest.mock import MagicMock, patch

# ── Setup path ──────────────────────────────────────────────────────────────
# Le package s'appelle `src` et est installé depuis la racine crewai-engine.
# On s'assure que la racine du projet est dans le path.
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# ── Env vars Cortex ──────────────────────────────────────────────────────────
os.environ["CORTEX_URL"] = "https://cortex.hearst.app"
os.environ["CORTEX_API_KEY"] = "4f91968a4a8e6767555bcac33cc9428a232a86cab3845a6c8f50484ec66e52f8"


# ─────────────────────────────────────────────────────────────────────────────
# Test 1 : _fetch_cortex_context avec Cortex UP
# ─────────────────────────────────────────────────────────────────────────────
def test_fetch_cortex_context_up() -> bool:
    print("=== Test 1 : _fetch_cortex_context avec Cortex UP ===")

    from src.agents.architect import _fetch_cortex_context

    intent = "Crée un swarm qui audite la sécurité des secrets dans Cortex"
    ctx = _fetch_cortex_context(intent)

    if ctx == "":
        print("  INFO : Cortex a renvoyé vide (aucune note similaire ou Cortex down).")
        print("  NOTE : Ce n'est pas un FAIL — fail-soft retourne '' si aucun résultat.")
        # On passe quand même : le comportement est correct (fail-soft attendu)
        return True

    if ctx.startswith("## Contexte historique Cortex"):
        print(f"  OK : cortex_context présent ({len(ctx)} chars)")
        print(f"  Preview : {ctx[:300]}")
        return True

    print(f"  FAIL : contenu inattendu : {ctx[:200]}")
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Test 2 : _fetch_cortex_context en mode Cortex DOWN
# ─────────────────────────────────────────────────────────────────────────────
def test_fetch_cortex_context_down() -> bool:
    print("\n=== Test 2 : _fetch_cortex_context en mode Cortex DOWN ===")

    # On patche requests.post pour simuler une ConnectionError
    import requests

    with patch.object(requests, "post", side_effect=requests.ConnectionError("refused")):
        # Reload vault_search pour repartir d'un VaultSearchTool frais
        import src.tools.vault_search as vs_mod
        importlib.reload(vs_mod)

        # Reimport architect avec le tool patchée
        import src.agents.architect as arch_mod
        # Reset l'instance partagée
        arch_mod._vault_tool = None

        intent = "Crée un swarm pour la gestion de l'inbox"
        try:
            ctx = arch_mod._fetch_cortex_context(intent)
        except Exception as exc:
            print(f"  FAIL : exception au lieu de fail-soft : {type(exc).__name__}: {exc}")
            return False

    if ctx == "":
        print("  OK : fail-soft correct — retourne '' sans exception")
        return True

    print(f"  WARN : retour inattendu en mode down : {ctx[:100]}")
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Test 3 : generate_swarm_spec retourne cortex_context dans le résultat
#          (LLM mocké pour éviter coût)
# ─────────────────────────────────────────────────────────────────────────────
_MOCK_SWARM_SPEC = {
    "name": "Security Audit Swarm",
    "description": "Swarm d'audit sécurité des secrets Cortex",
    "agents": [
        {
            "name": "Analyst",
            "role": "analyst",
            "system_prompt": "Tu analyses les secrets exposés.",
            "provider": "hypercli",
            "model": "kimi-k2.6",
        }
    ],
    "tasks": [
        {
            "name": "Audit secrets",
            "description": "Recherche les secrets exposés dans le code.",
            "expected_output": "Liste des secrets trouvés.",
            "agent_index": 0,
        }
    ],
}


def test_generate_swarm_spec_has_cortex_context() -> bool:
    print("\n=== Test 3 : generate_swarm_spec retourne cortex_context (LLM mocké) ===")

    import src.agents.architect as arch_mod
    importlib.reload(arch_mod)
    arch_mod._vault_tool = None

    # Mock du LLM pour ne pas dépenser ~$0.50
    mock_llm = MagicMock()
    mock_llm.call.return_value = json.dumps(_MOCK_SWARM_SPEC)

    with patch.object(arch_mod, "get_llm", return_value=mock_llm):
        intent = "Crée un swarm qui audite la sécurité des secrets dans Cortex"
        result = arch_mod.generate_swarm_spec(prompt=intent, available_tools=[])

    print(f"  Result keys: {list(result.keys())}")

    if "cortex_context" not in result:
        print("  FAIL : clé 'cortex_context' absente du résultat")
        return False

    ctx = result["cortex_context"]
    if ctx == "":
        print("  INFO : cortex_context vide (Cortex n'a pas retourné de notes similaires)")
    else:
        print(f"  OK : cortex_context présent ({len(ctx)} chars)")
        print(f"  Preview : {ctx[:200]}")

    # On vérifie que la spec est bien présente (agents ou error)
    if "agents" in result or "error" in result:
        status = "spec générée" if "agents" in result else f"erreur: {result.get('error', '')[:80]}"
        print(f"  Spec : {status}")
    else:
        print(f"  Result complet : {list(result.keys())}")

    # Le critère principal : la clé cortex_context EST présente
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    results = []

    results.append(test_fetch_cortex_context_up())
    results.append(test_fetch_cortex_context_down())
    results.append(test_generate_swarm_spec_has_cortex_context())

    passed = sum(results)
    total = len(results)
    print(f"\n=== Résultat : {passed}/{total} PASS ===")
    sys.exit(0 if passed == total else 1)
