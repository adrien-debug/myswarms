"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

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
      className="ct-primary-btn"
    >
      {pending ? "Running…" : "Run now"}
    </button>
  );
}

export function KickoffForm({ action }: { action: KickoffAction }) {
  const [state, formAction] = useActionState<KickoffFormState, FormData>(action, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <form action={formAction} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select
          name="trigger"
          defaultValue="on_demand"
          style={{ background: "var(--ct-surface-2)", border: "1px solid var(--ct-border)", borderRadius: 8, padding: "8px 12px", color: "var(--ct-text-primary)", fontSize: 13, fontFamily: "inherit" }}
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
          style={{ borderRadius: 8, border: "1px solid var(--ct-alert-error-border)", background: "var(--ct-alert-error-bg)", padding: "8px 12px", fontSize: 11, color: "var(--ct-alert-error-text)" }}
        >
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
