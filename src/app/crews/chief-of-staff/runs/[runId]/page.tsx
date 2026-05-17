import Link from "next/link";
import { notFound } from "next/navigation";
import { crewaiClient } from "@/lib/crewai/client";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";

const CREW_NAME = "chief-of-staff";

// UUID v4-ish format (8-4-4-4-12 hex chars). Strict enough to prevent path-traversal-style abuse.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default async function RunDetailPage({ params }: PageProps) {
  const { runId } = await params;

  // Validate UUID format before hitting microservice.
  // Defense-in-depth: the microservice's Pydantic UUID type also validates,
  // but blocking here avoids unnecessary network calls + clarifies the contract.
  if (!UUID_REGEX.test(runId)) {
    notFound();
  }

  let run;
  try {
    run = await crewaiClient.status(CREW_NAME, runId);
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      notFound();
    }
    return (
      <main className="mx-auto max-w-3xl p-8">
        <Link href={`/crews/${CREW_NAME}`} className="text-sm text-neutral-500 hover:underline">
          ← Daily Chief of Staff
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Run {runId.slice(0, 8)}…</h1>
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load run: {err instanceof Error ? err.message : "unknown error"}
        </p>
      </main>
    );
  }

  // Try to parse result as JSON for pretty-print (mock mode returns JSON)
  let resultPretty: string | null = null;
  if (run.result) {
    try {
      const parsed: unknown = JSON.parse(run.result);
      resultPretty = JSON.stringify(parsed, null, 2);
    } catch {
      resultPretty = null;
    }
  }

  const statePretty = run.state ? JSON.stringify(run.state, null, 2) : null;
  const triggerLabel =
    run.state && typeof run.state === "object" && "trigger" in run.state
      ? String((run.state as Record<string, unknown>)["trigger"])
      : "?";

  return (
    <main className="mx-auto max-w-4xl p-8">
      {/* Auto-refresh every 5s while the crew flow is running. Stops when status is terminal. */}
      <AutoRefresh active={run.status === "running"} seconds={5} />
      <Link href={`/crews/${CREW_NAME}`} className="text-sm text-neutral-500 hover:underline">
        ← Daily Chief of Staff
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold font-mono">{runId.slice(0, 8)}…</h1>
        <div className="mt-2 flex items-center gap-3 text-sm">
          <StatusBadge status={run.status} size="md" />
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-700">
            trigger: <span className="font-mono">{triggerLabel}</span>
          </span>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4">
        <Field label="Started at" value={formatDate(run.started_at, { withSeconds: true, withYear: true })} />
        <Field
          label="Finished at"
          value={run.finished_at ? formatDate(run.finished_at, { withSeconds: true, withYear: true }) : "—"}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Result
        </h2>
        {run.result ? (
          <pre className="overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs font-mono">
            {resultPretty ?? run.result}
          </pre>
        ) : (
          <p className="text-sm text-neutral-500">No result yet.</p>
        )}
      </section>

      {statePretty && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            State
          </h2>
          <pre className="overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs font-mono">
            {statePretty}
          </pre>
        </section>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-mono">{value}</div>
    </div>
  );
}
