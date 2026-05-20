import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { formatDate } from "@/lib/utils/format";
import { isValidUuidV4 } from "@/lib/utils/uuid";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { FONT, LINE_HEIGHT, SPACING } from "@/lib/ui/tokens";
import { requireOwnerId } from "@/lib/auth/owner";
import { Chevron } from "@/components/ui/Chevron";
import { PageTitle } from "@/components/ui/PageTitle";
import { ErrorLayout } from "@/components/ui/ErrorLayout";
import { LiveIndicator } from "@/components/runs/LiveIndicator";
import { isRunningStatus } from "@/lib/crewai/runStatus";

const CREW_NAME = "chief-of-staff";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default async function RunDetailPage({ params }: PageProps) {
  const { runId } = await params;

  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch {
    redirect("/login");
  }

  // Validate UUID v4 format before hitting microservice.
  // Defense-in-depth: the microservice's Pydantic UUID type also validates,
  // but blocking here avoids unnecessary network calls + clarifies the contract.
  if (!isValidUuidV4(runId)) {
    notFound();
  }

  let run;
  try {
    run = await crewaiClient.status(CREW_NAME, runId, { ownerId });
  } catch (err) {
    if (err instanceof CrewaiEngineError && err.status === 404) {
      notFound();
    }
    return (
      <>
        <Link href="/" className="ct-breadcrumb-link" style={{ fontSize: FONT.base }}>
          <Chevron direction="left" />Cockpit
        </Link>
        <ErrorLayout
          title="Run not found"
          message={`Failed to load run: ${err instanceof Error ? err.message : "unknown error"}`}
        />
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

  const isRunning = isRunningStatus(run.status);

  const statePretty = run.state ? JSON.stringify(run.state, null, 2) : null;
  const triggerLabel =
    run.state && typeof run.state === "object" && "trigger" in run.state
      ? String((run.state as Record<string, unknown>)["trigger"])
      : "?";

  return (
    <>
      {/* Auto-refresh every 5s while the crew flow is running. Stops when status is terminal. */}
      <AutoRefresh active={isRunning} seconds={5} />

      <Link href="/" className="ct-breadcrumb-link" style={{ fontSize: FONT.base }}>
        <Chevron direction="left" />Cockpit
      </Link>

      <div style={{ marginTop: SPACING.sm, marginBottom: SPACING.xl }}>
        <PageTitle variant="mono" style={{ marginBottom: SPACING.sm }}>
          {runId.slice(0, 8)}…
        </PageTitle>
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.md, flexWrap: "wrap" }}>
          <StatusBadge status={run.status} size="md" />
          <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.base }}>·</span>
          <span style={{ fontSize: FONT.base, color: "var(--ct-text-body)" }}>
            trigger :{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--ct-text-strong)" }}>
              {triggerLabel}
            </span>
          </span>
          {isRunning && run.status !== "paused_hitl" && <LiveIndicator intervalSeconds={5} />}
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
          label="Started at"
          value={formatDate(run.started_at, { withSeconds: true, withYear: true })}
        />
        <Field
          label="Finished at"
          value={
            run.finished_at
              ? formatDate(run.finished_at, { withSeconds: true, withYear: true })
              : "—"
          }
        />
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <div className="ct-eyebrow">Result</div>
        {run.result ? (
          <div className="ct-card" style={{ padding: 0 }}>
            <pre
              style={{
                overflow: "auto",
                padding: `${SPACING.lg}px ${SPACING.lx}px`,
                fontSize: FONT.xs,
                fontFamily: "var(--font-mono)",
                color: "var(--ct-text-body)",
                lineHeight: LINE_HEIGHT.base,
                margin: 0,
              }}
            >
              {resultPretty ?? run.result}
            </pre>
          </div>
        ) : (
          <p className="ct-placeholder">No result yet.</p>
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
                fontFamily: "var(--font-mono)",
                color: "var(--ct-text-body)",
                lineHeight: LINE_HEIGHT.base,
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
          fontFamily: "var(--font-mono)",
          color: "var(--ct-text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
