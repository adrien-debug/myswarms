"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FONT, RADIUS, SPACING } from "@/lib/ui/tokens";

export interface KickoffFormState {
  error?: string;
}

type KickoffAction = (
  prevState: KickoffFormState,
  formData: FormData,
) => Promise<KickoffFormState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="ct-seg-btn primary"
    >
      {pending ? "Running…" : "Run now"}
    </button>
  );
}

export function KickoffForm({ action }: { action: KickoffAction }) {
  const [state, formAction] = useActionState<KickoffFormState, FormData>(action, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: SPACING.sm }}>
      <form action={formAction} style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
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
        <SubmitButton />
      </form>
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
