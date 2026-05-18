import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";
import { formatDate } from "@/lib/utils/format";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { KickoffForm, type KickoffFormState } from "@/components/runs/KickoffForm";
import { SwarmArchiveButton } from "@/components/swarms/SwarmArchiveButton";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { SwarmRunSummary } from "@/lib/forms/swarmSchemas";
import type { CSSProperties } from "react";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

const ALLOWED_TRIGGERS = ["morning", "evening", "intraday", "on_demand", "webhook"] as const;
type Trigger = (typeof ALLOWED_TRIGGERS)[number];

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SwarmDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  async function triggerKickoff(
    _prevState: KickoffFormState,
    formData: FormData,
  ): Promise<KickoffFormState> {
    "use server";
    const raw = formData.get("trigger");
    const trigger: Trigger = (ALLOWED_TRIGGERS as readonly string[]).includes(String(raw))
      ? (raw as Trigger)
      : "on_demand";

    let runId: string;
    try {
      const ownerId = await getOwnerId();
      const result = await swarmsClient.kickoff(id, { trigger }, ownerId);
      runId = result.run_id;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to kickoff" };
    }
    redirect(`/swarms/${id}/runs/${runId}`);
  }

  let swarm;
  try {
    const ownerId = await getOwnerId();
    swarm = await swarmsClient.get(id, ownerId);
  } catch (err) {
    if (err instanceof SwarmEngineError && err.status === 404) notFound();
    return (
      <>
        <div className="ct-eyebrow">
          <Link
            href="/swarms"
            className="ct-breadcrumb-link"
          >
            ← Swarms
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

  let recentRuns: SwarmRunSummary[] = [];
  let listRunsError: string | null = null;
  try {
    const ownerId = await getOwnerId();
    recentRuns = await swarmsClient.listRuns(id, 10, ownerId);
  } catch (err) {
    listRunsError = err instanceof Error ? err.message : "Erreur de chargement des runs";
  }

  const totalRuns = recentRuns.length;
  const activeRuns = recentRuns.filter((r) => r.status === "running").length;
  const succeededRuns = recentRuns.filter((r) => r.status === "completed").length;
  const totalCost = recentRuns.reduce((acc, r) => acc + r.total_cost_usd, 0);

  return (
    <>
      <div className="ct-eyebrow">
        <Link
          href="/swarms"
          style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
        >
          ← Swarms
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACING.md,
              flexWrap: "wrap",
            }}
          >
            <h1 className="ct-title">
              {swarm.name}
            </h1>
            {/* F8 : badge ARCHIVÉ si swarm soft-deleted (is_active=false). */}
            {swarm.is_active === false ? (
              <span style={archivedBadgeStyle}>
                Archivé
              </span>
            ) : null}
          </div>
          <p className="ct-sub">
            {swarm.description || "Aucune description."}
          </p>
        </div>
        <div style={{ display: "flex", gap: SPACING.sm, alignItems: "center" }}>
          {/* F8 : si archivé, on désactive Run/Edit (lien Edit → span disabled,
              KickoffForm n'est plus rendu). L'utilisateur peut toujours
              désarchiver via le bouton dédié (à venir) — pour l'instant
              il doit recréer le swarm. */}
          {swarm.is_active === false ? (
            <>
              <span
                className="ct-seg-btn"
                aria-disabled="true"
                style={{ opacity: 0.5, pointerEvents: "none" }}
                title="Swarm archivé — désactivé"
              >
                Éditer
              </span>
              <span
                style={{
                  fontSize: FONT.xs,
                  color: "var(--ct-text-muted)",
                  fontStyle: "italic",
                }}
              >
                Swarm archivé — non déclenchable
              </span>
            </>
          ) : (
            <>
              <Link href={`/swarms/${id}/edit`} className="ct-seg-btn">
                Éditer
              </Link>
              <SwarmArchiveButton swarmId={id} swarmName={swarm.name} />
              <KickoffForm action={triggerKickoff} />
            </>
          )}
        </div>
      </div>

      <KPIDashboard
        kpis={[
          { label: "Agents", value: swarm.agents.length, accent: true },
          { label: "Tâches", value: swarm.tasks.length },
          { label: "Runs récents", value: totalRuns },
          { label: "Active", value: activeRuns },
        ]}
      />

      <div className="ct-card">
        <div className="ct-card-title">Composition</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(var(--ct-card-min-w), 1fr))", gap: SPACING.xl }}>
          <div>
            <SectionLabel text="Agents" />
            {swarm.agents.length === 0 ? (
              <p className="ct-placeholder">Aucun agent.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {swarm.agents.map((a) => (
                  <li
                    key={a.id ?? a.name}
                    style={{
                      padding: `${SPACING.sm}px 0`,
                      borderBottom: "1px solid var(--ct-border-soft)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div
                      style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)" }}
                    >
                      {a.role} · {a.model_provider}/{a.model_name}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionLabel text="Tâches" />
            {swarm.tasks.length === 0 ? (
              <p className="ct-placeholder">Aucune tâche.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {swarm.tasks.map((t) => (
                  <li
                    key={t.id ?? t.name}
                    style={{
                      padding: `${SPACING.sm}px 0`,
                      borderBottom: "1px solid var(--ct-border-soft)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div
                      style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)" }}
                    >
                      {t.description.slice(0, 80)}
                      {t.description.length > 80 ? "…" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="ct-card">
        <div className="ct-card-title">Runs récents</div>
        {listRunsError ? (
          <p className="ct-placeholder" style={{ color: "var(--ct-accent-strong)" }}>
            ⚠️ {listRunsError}
          </p>
        ) : recentRuns.length === 0 ? (
          <p className="ct-placeholder">
            Aucun run pour l&apos;instant. Lance-en un via le bouton ci-dessus.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.base }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--ct-border)",
                  textAlign: "left",
                }}
              >
                <th style={thStyle}>Run</th>
                <th style={thStyle}>Trigger</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Finished</th>
                <th style={thStyle}>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid var(--ct-border-soft)" }}
                >
                  <td style={tdStyle}>
                    <Link
                      href={`/swarms/${id}/runs/${r.id}`}
                      className="ct-link"
                      style={{
                        fontFamily: "monospace",
                        fontSize: FONT.sm,
                      }}
                    >
                      {r.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td style={tdStyle}>{r.trigger}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                    {formatDate(r.started_at)}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                    {r.finished_at ? formatDate(r.finished_at) : "—"}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                    {r.total_tokens_in + r.total_tokens_out}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {succeededRuns > 0 && totalRuns > 0 ? (
          <p
            style={{
              fontSize: FONT.xs,
              color: "var(--ct-text-muted)",
              marginTop: SPACING.md,
            }}
          >
            {succeededRuns}/{totalRuns} succès · coût cumulé $
            {totalCost.toFixed(4)}
          </p>
        ) : null}
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: `${SPACING.xxs + 4}px ${SPACING.md}px`,
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: LETTER_SPACING.wide,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};
const tdStyle: React.CSSProperties = {
  padding: `${SPACING.xxs + 4}px ${SPACING.md}px`,
  color: "var(--ct-text-body)",
};

const archivedBadgeStyle: CSSProperties = {
  background: "var(--ct-accent-soft)",
  color: "var(--ct-accent-strong)",
  padding: `${SPACING.xs}px ${SPACING.md}px`,
  borderRadius: RADIUS.sm,
  fontSize: FONT.sm,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
};
