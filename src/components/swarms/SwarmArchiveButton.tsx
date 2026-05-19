"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FONT, SPACING } from "@/lib/ui/tokens";
import { AlertDialog } from "@/components/ui/AlertDialog";

interface SwarmArchiveButtonProps {
  swarmId: string;
  swarmName: string;
}

/**
 * Bouton "Archiver" (terme volontaire — pas "Supprimer" — pour réduire
 * l'angoisse). Appelle DELETE /api/swarms/[id] via AlertDialog puis
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleConfirm() {
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
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setBusy(false);
      throw err;
    }
  }

  return (
    <>
      <div style={{ display: "inline-flex", flexDirection: "column", gap: SPACING.xs }}>
        <button
          type="button"
          className="ct-seg-btn"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          aria-disabled={busy}
          title="Désactive le swarm — réversible"
        >
          {busy ? "Archivage…" : "Archiver"}
        </button>
        {error ? (
          <span
            style={{
              fontSize: FONT.xs,
              color: "var(--ct-accent-strong)",
            }}
          >
            {error}
          </span>
        ) : null}
      </div>

      <AlertDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title={`Archiver le swarm "${swarmName}" ?`}
        description="Le swarm ne sera plus déclenchable. Tu pourras le réactiver plus tard."
        confirmLabel="Archiver"
        cancelLabel="Annuler"
        variant="destructive"
        busy={busy}
      />
    </>
  );
}
