import Link from "next/link";
import { notFound } from "next/navigation";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { formatDate } from "@/lib/utils/format";
import { isValidUuidV4 } from "@/lib/utils/uuid";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { FONT, SPACING } from "@/lib/ui/tokens";

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
        <Link href="/" className="ct-breadcrumb-link" style={{ fontSize: FONT.base }}>
          ← Cockpit
        </Link>
        <h1 className="ct-title" style={{ marginTop: SPACING.sm }}>
          Run {runId.slice(0, 8)}…
        </h1>
        <div
          className="ct-card"
          style={{
            border: "1px solid var(--ct-border-accent)",
            background: "var(--ct-accent-soft)",
          }}
        >
          <p className="ct-card-body" style={{ color: "var(--ct-alert-error-text)" }}>
            Impossible de charger le run : {err instanceof Error ? err.message : "erreur inconnue"}
          </p>
        </div>
      </>
    );
  }

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

      <Link href="/" className="ct-breadcrumb-link" style={{ fontSize: FONT.base }}>
        ← Cockpit
      </Link>

      <div style={{ marginTop: SPACING.sm, marginBottom: SPACING.xl }}>
        <h1 className="ct-title" style={{ fontFamily: "monospace", marginBottom: SPACING.sm }}>
          {runId.slice(0, 8)}…
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.md }}>
          <StatusBadge status={run.status} size="md" />
          <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.base }}>·</span>
          <span style={{ fontSize: FONT.base, color: "var(--ct-text-body)" }}>
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
          gap: SPACING.lg,
          marginBottom: SPACING.xl,
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

      <div style={{ marginBottom: SPACING.xl }}>
        <div className="ct-eyebrow">Résultat</div>
        {run.result ? (
          <div className="ct-card" style={{ padding: 0 }}>
            <pre
              style={{
                overflow: "auto",
                padding: `${SPACING.lg}px ${SPACING.lx}px`,
                fontSize: FONT.xs,
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
                padding: `${SPACING.lg}px ${SPACING.lx}px`,
                fontSize: FONT.xs,
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
          fontSize: FONT.base,
          fontFamily: "monospace",
          color: "var(--ct-text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
