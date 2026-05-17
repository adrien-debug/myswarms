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
            style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
          >
            ← Swarm
          </Link>
        </div>
        <h1 className="ct-title">Erreur</h1>
        <div
          className="ct-card"
          style={{ borderColor: "var(--ct-border-accent)" }}
        >
          <div className="ct-card-title">Chargement échoué</div>
          <p className="ct-card-body">
            {err instanceof Error ? err.message : "Unknown error"}
          </p>
        </div>
      </>
    );
  }

  // C3 fix : inclure `paused_hitl` pour que le polling reprenne automatiquement
  // à la sortie de la pause Human-in-the-Loop (sinon l'UI reste figée).
  const isRunning = (["running", "pending", "paused_hitl"] as const).includes(
    run.status as "running" | "pending" | "paused_hitl",
  );

  return (
    <>
      <AutoRefresh active={isRunning} seconds={5} />
      <div className="ct-eyebrow">
        <Link
          href={`/swarms/${id}`}
          style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
        >
          ← Swarm
        </Link>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            className="ct-title"
            style={{ fontFamily: "monospace", fontSize: 22 }}
          >
            Run {runId.slice(0, 8)}…
          </h1>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <StatusBadge status={run.status} size="md" />
            <span style={{ color: "var(--ct-text-muted)", fontSize: 13 }}>
              trigger : {run.trigger}
            </span>
          </div>
        </div>
      </div>

      <KPIDashboard
        kpis={[
          {
            label: "Tokens in",
            value: run.total_tokens_in.toLocaleString("fr-FR"),
            accent: true,
          },
          {
            label: "Tokens out",
            value: run.total_tokens_out.toLocaleString("fr-FR"),
          },
          { label: "Cost $", value: run.total_cost_usd.toFixed(4) },
          { label: "Steps", value: run.steps.length },
        ]}
      />

      <div className="ct-card">
        <div className="ct-card-title">Métadonnées</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <Field
            label="Démarré"
            value={formatDate(run.started_at, {
              withSeconds: true,
              withYear: true,
            })}
          />
          <Field
            label="Terminé"
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

      {run.error_text ? (
        <div
          className="ct-card"
          style={{
            borderColor: "var(--ct-border-accent)",
            background: "var(--ct-accent-soft)",
          }}
        >
          <div className="ct-card-title">Erreur</div>
          <pre
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              color: "var(--ct-text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {run.error_text}
          </pre>
        </div>
      ) : null}

      {run.result_text ? (
        <div className="ct-card">
          <div className="ct-card-title">Résultat</div>
          <pre
            style={{
              background: "var(--ct-surface-2)",
              border: "1px solid var(--ct-border)",
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              color: "var(--ct-text-primary)",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflow: "auto",
              maxHeight: 360,
            }}
          >
            {prettyJsonOrRaw(run.result_text)}
          </pre>
        </div>
      ) : null}

      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ct-text-muted)",
          margin: "24px 0 12px",
        }}
      >
        Timeline ({run.steps.length} steps)
      </div>
      <RunTimeline steps={run.steps} />
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
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ct-text-muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ct-text-primary)",
          fontFamily: mono ? "monospace" : "inherit",
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
