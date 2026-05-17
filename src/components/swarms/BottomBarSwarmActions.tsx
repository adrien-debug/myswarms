"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// H6 : aucun magic number à migrer ici — toute la mise en forme est portée
// par les classes .ct-seg-btn (cockpit.css).

interface BottomBarSwarmActionsProps {
  swarmId: string;
}

/**
 * Actions contextuelles affichées dans la BottomBar sur la route /swarms/[id].
 * Pour l'instant : bouton "Run" qui kickoff le swarm en mode on_demand puis
 * redirige vers la page run créée.
 *
 * Découplé de BottomBar pour ne pas mélanger logique de navigation (Link)
 * et logique async (fetch + push) dans le même composant.
 */
export function BottomBarSwarmActions({ swarmId }: BottomBarSwarmActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/swarms/${swarmId}/kickoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "on_demand" }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status} — ${body}`);
      }
      const { run_id: runId } = (await res.json()) as { run_id: string };
      router.push(`/swarms/${swarmId}/runs/${runId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="ct-seg-btn primary"
      onClick={handleRun}
      disabled={busy}
      title={error ?? "Lance un run on_demand"}
    >
      {busy ? "Run…" : "Run"}
    </button>
  );
}
