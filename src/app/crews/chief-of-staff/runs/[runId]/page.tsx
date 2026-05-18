import Link from "next/link";
import { notFound } from "next/navigation";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { formatDate } from "@/lib/utils/format";
import { isValidUuidV4 } from "@/lib/utils/uuid";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";

const CREW_NAME = "chief-of-staff";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default async function RunDetailPage({ params }: PageProps) {
  const { runId } = await params;

  // Validate UUID v4 format before hitting microservice.
  // Defense-in-depth: the microservice's Pydantic UUID type also validates,
  // but blocking here avoids unnecessary network calls + clarifies the contract.
  if (!isValidUuidV4(runId)) {
    notFound();
  }

  let run;
  try {
    run = await crewaiClient.status(CREW_NAME, runId);
  } catch (err) {
    if (err instanceof CrewaiEngineError && err.status === 404) {
      notFound();
    }
    return (
      <>
        <Link href={`/crews/${CREW_NAME}`} className="ct-breadcrumb-link" style={{ fontSize: 13 }}>
          ← Daily Chief of Staff
        </Link>
        <h1 className="ct-title" style={{ marginTop: 8 }}>
          Run {runId.slice(0, 8)}…
        </h1>
        <div
          className="ct-card"
          style={{
            border: "1px solid rgba(225,29,72,0.55)",
            background: "rgba(225,29,72,0.08)",
          }}
        >
          <p className="ct-card-body" style={{ color: "var(--ct-alert-error-text)" }}>
            Impossible de charger le run : {err instanceof Error ? err.message : "erreur inconnue"}
          </p>
        </div>
      </>
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
    <>
      {/* Auto-refresh every 5s while the crew flow is running. Stops when status is terminal. */}
      <AutoRefresh active={run.status === "running"} seconds={5} />

      <Link href={`/crews/${CREW_NAME}`} className="ct-breadcrumb-link" style={{ fontSize: 13 }}>
        ← Daily Chief of Staff
      </Link>

      <div style={{ marginTop: 8, marginBottom: 24 }}>
        <h1 className="ct-title" style={{ fontFamily: "monospace", marginBottom: 8 }}>
          {runId.slice(0, 8)}…
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StatusBadge status={run.status} size="md" />
          <span style={{ color: "var(--ct-text-muted)", fontSize: 13 }}>·</span>
          <span style={{ fontSize: 13, color: "var(--ct-text-body)" }}>
            trigger :{" "}
            <span style={{ fontFamily: "monospace", color: "var(--ct-text-strong)" }}>
              {triggerLabel}
            </span>
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Field
          label="Démarré à"
          value={formatDate(run.started_at, { withSeconds: true, withYear: true })}
        />
        <Field
          label="Terminé à"
          value={
            run.finished_at
              ? formatDate(run.finished_at, { withSeconds: true, withYear: true })
              : "—"
          }
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="ct-eyebrow">Résultat</div>
        {run.result ? (
          <div className="ct-card" style={{ padding: 0 }}>
            <pre
              style={{
                overflow: "auto",
                padding: "16px 20px",
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--ct-text-body)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {resultPretty ?? run.result}
            </pre>
          </div>
        ) : (
          <p className="ct-placeholder">Pas encore de résultat.</p>
        )}
      </div>

      {statePretty && (
        <div>
          <div className="ct-eyebrow">State</div>
          <div className="ct-card" style={{ padding: 0 }}>
            <pre
              style={{
                overflow: "auto",
                padding: "16px 20px",
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--ct-text-body)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {statePretty}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ct-card" style={{ marginBottom: 0 }}>
      <div className="ct-card-title">{label}</div>
      <div
        style={{
          fontSize: 13,
          fontFamily: "monospace",
          color: "var(--ct-text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
