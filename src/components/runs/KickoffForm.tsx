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
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Running…" : "Run now"}
    </button>
  );
}

export function KickoffForm({ action }: { action: KickoffAction }) {
  const [state, formAction] = useActionState<KickoffFormState, FormData>(action, {});

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction} className="flex items-center gap-2">
        <select
          name="trigger"
          defaultValue="on_demand"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
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
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
