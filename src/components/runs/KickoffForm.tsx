"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { FONT, RADIUS, SPACING } from "@/lib/ui/tokens";
import { AlertDialog } from "@/components/ui/AlertDialog";

export interface KickoffFormState {
  error?: string;
}

type KickoffAction = (
  prevState: KickoffFormState,
  formData: FormData,
) => Promise<KickoffFormState>;

export function KickoffForm({ action }: { action: KickoffAction }) {
  // isPending : 3e élément du tuple useActionState (React 19) — true pendant l'action serveur
  const [state, formAction, isPending] = useActionState<KickoffFormState, FormData>(action, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleConfirm = () => {
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: SPACING.sm }}>
      <form
        ref={formRef}
        action={formAction}
        style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}
      >
        <select
          name="trigger"
          defaultValue="on_demand"
          style={{ background: "var(--ct-surface-2)", border: "1px solid var(--ct-border)", borderRadius: RADIUS.md, padding: `${SPACING.sm}px ${SPACING.md}px`, color: "var(--ct-text-primary)", fontSize: FONT.base, fontFamily: "inherit" }}
        >
          <option value="on_demand">On-demand</option>
          <option value="morning">Morning</option>
          <option value="evening">Evening</option>
          <option value="intraday">Intraday</option>
        </select>
        {/* Submit invisible — déclenché par requestSubmit() depuis onConfirm */}
        <button type="submit" style={{ display: "none" }} aria-hidden="true" />
      </form>

      {/* Bouton visible — ouvre la dialog, pas un submit direct */}
      <button
        type="button"
        className="ct-seg-btn primary"
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {isPending ? "Running…" : "Run now"}
      </button>

      <AlertDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="Run this now?"
        description="This action consumes LLM tokens and is not reversible."
        confirmLabel="Run"
        cancelLabel="Cancel"
        variant="warning"
      />

      {state.error ? (
        <p
          role="alert"
          style={{ borderRadius: RADIUS.md, border: "1px solid var(--ct-alert-error-border)", background: "var(--ct-alert-error-bg)", padding: `${SPACING.sm}px ${SPACING.md}px`, fontSize: FONT.xs, color: "var(--ct-alert-error-text)" }}
        >
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
