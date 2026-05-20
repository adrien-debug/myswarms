// TODO V2 — Race multi-onglets polling :
// Si l'utilisateur ouvre la même page run dans N onglets en parallèle, chaque
// onglet déclenche son propre `AutoRefresh` → N polls/sec vers
// /api/swarms/[id]/runs/[runId]. Pas critique en single-user (charge négligeable
// sur l'engine), mais à corriger en V2 multi-tenant via :
//  - BroadcastChannel cross-tab pour partager le dernier état (1 onglet leader,
//    les autres écoutent) ;
//  - OU SSE / WebSocket côté engine pour push en lieu et place du polling.
// Cf reviewer Stage 4 — dette acceptée pour V1 (pas de fix code immédiat).
import Link from "next/link";
import { notFound } from "next/navigation";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { RunTimeline } from "@/components/swarms/RunTimeline";
import { FONT, RADIUS, SPACING } from "@/lib/ui/tokens";
import { Chevron } from "@/components/ui/Chevron";
import { PageTitle } from "@/components/ui/PageTitle";
import { ErrorLayout } from "@/components/ui/ErrorLayout";
import { LiveIndicator } from "@/components/runs/LiveIndicator";
import { isRunningStatus } from "@/lib/crewai/runStatus";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; runId: string }>;
}

export default async function SwarmRunDetailPage({ params }: PageProps) {
  const { id, runId } = await params;
  if (!isValidUuid(id) || !isValidUuid(runId)) notFound();

  let run;
  try {
    const ownerId = await getOwnerId();
    run = await swarmsClient.status(id, runId, ownerId);
  } catch (err) {
    if (err instanceof SwarmEngineError && err.status === 404) notFound();
    return (
      <>
        <div className="ct-eyebrow">
          <Link
            href={`/swarms/${id}`}
            className="ct-breadcrumb-link"
          >
            <Chevron direction="left" />Swarm
          </Link>
        </div>
        <ErrorLayout
          title="Run not found"
          message={err instanceof Error ? err.message : "Unknown error"}
        />
      </>
    );
  }

  const isRunning = isRunningStatus(run.status);

  return (
    <>
      <AutoRefresh active={isRunning} seconds={5} />
      <div className="ct-eyebrow">
        <Link
          href={`/swarms/${id}`}
          style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
        >
          <Chevron direction="left" />Swarm
        </Link>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: SPACING.lg,
          flexWrap: "wrap",
        }}
      >
        <div>
          <PageTitle variant="mono">
            Run {runId.slice(0, 8)}…
          </PageTitle>
          <div
            style={{
              display: "flex",
              gap: SPACING.md,
              alignItems: "center",
              marginBottom: SPACING.xl,
              flexWrap: "wrap",
            }}
          >
            <StatusBadge status={run.status} size="md" />
            <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.base }}>
              trigger : {run.trigger}
            </span>
            {isRunning && run.status !== "paused_hitl" && <LiveIndicator intervalSeconds={5} />}
          </div>
        </div>
      </div>

      <KPIDashboard
        kpis={[
          {
            label: "Tokens in",
            value: run.total_tokens_in.toLocaleString("en-US"),
            accent: true,
          },
          {
            label: "Tokens out",
            value: run.total_tokens_out.toLocaleString("en-US"),
          },
          { label: "Cost $", value: run.total_cost_usd.toFixed(4) },
          { label: "Steps", value: run.steps.length },
        ]}
      />

      <div className="ct-card">
        <div className="ct-card-title">Metadata</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: SPACING.lg,
          }}
        >
          <Field
            label="Started"
            value={formatDate(run.started_at, {
              withSeconds: true,
              withYear: true,
            })}
          />
          <Field
            label="Finished"
            value={
              run.finished_at
                ? formatDate(run.finished_at, {
                    withSeconds: true,
                    withYear: true,
                  })
                : "—"
            }
          />
          {run.langfuse_trace_id ? (
            <Field label="Langfuse trace" value={run.langfuse_trace_id} mono />
          ) : null}
        </div>
      </div>

      {run.error_text != null && run.error_text !== "" ? (
        <div
          className="ct-card"
          style={{
            borderColor: "var(--ct-border-accent)",
            background: "var(--ct-accent-soft)",
          }}
        >
          <div className="ct-card-title">Error</div>
          <pre
            style={{
              fontSize: FONT.sm,
              fontFamily: "var(--font-mono)",
              color: "var(--ct-text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {run.error_text}
          </pre>
        </div>
      ) : null}

      {run.result_text != null ? (
        <div className="ct-card">
          <div className="ct-card-title">Result</div>
          <pre
            style={{
              background: "var(--ct-surface-2)",
              border: "1px solid var(--ct-border)",
              borderRadius: RADIUS.md,
              padding: SPACING.md,
              fontSize: FONT.sm,
              color: "var(--ct-text-primary)",
              fontFamily: "var(--font-mono)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflow: "auto",
              maxHeight: "var(--ct-result-max-h)",
            }}
          >
            {prettyJsonOrRaw(run.result_text)}
          </pre>
        </div>
      ) : null}

      <div
        className="ct-eyebrow"
        style={{ margin: `${SPACING.xl}px 0 ${SPACING.md}px` }}
      >
        Timeline ({run.steps.length} steps)
      </div>
      <RunTimeline steps={run.steps} status={run.status} />
    </>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="ct-eyebrow" style={{ marginBottom: SPACING.xs }}>
        {label}
      </div>
      <div
        style={{
          fontSize: FONT.base,
          color: "var(--ct-text-primary)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function prettyJsonOrRaw(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}
