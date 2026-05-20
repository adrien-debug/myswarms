"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FONT, SPACING } from "@/lib/ui/tokens";

interface SwarmArchiveButtonProps {
  swarmId: string;
  swarmName: string;
}

/**
 * Bouton "Archiver" (terme volontaire — pas "Supprimer" — pour réduire
 * l'angoisse). Appelle DELETE /api/swarms/[id] avec confirm() natif puis
 * redirige vers la liste.
 *
 * Côté backend, DELETE est un soft-archive logique en V1 (l'engine décide
 * de la sémantique exacte : flag is_active=false ou suppression dure).
 */
export function SwarmArchiveButton({
  swarmId,
  swarmName,
}: SwarmArchiveButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    const ok = window.confirm(
      `Archive swarm "${swarmName}"?\n\n` +
        "The swarm will no longer be triggerable. You can reactivate it later.",
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/swarms/${swarmId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status} — ${body}`);
      }
      router.push("/swarms");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: SPACING.xs }}>
      <button
        type="button"
        className="ct-seg-btn"
        onClick={handleArchive}
        disabled={busy}
        title="Disable the swarm — reversible"
      >
        {busy ? "Archiving…" : "Archive"}
      </button>
      {error ? (
        <span
          role="alert"
          aria-live="assertive"
          style={{
            fontSize: FONT.xs,
            color: "var(--ct-accent-strong)",
          }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
