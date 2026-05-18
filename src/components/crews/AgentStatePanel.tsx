import { SPACING, FONT, RADIUS } from "@/lib/ui/tokens";
import type { AgentRow, RunStats } from "@/lib/crews/chiefTypes";

interface Props {
  agentRows: AgentRow[];
  runStats: RunStats | null;
  lastRunAt: string | null;
  runStatus: string | null;
}

function statusColor(status: AgentRow["status"]): string {
  switch (status) {
    case "active":
      return "var(--cos-accent)";
    case "idle":
      return "var(--ct-text-muted)";
    case "pending":
      return "var(--ct-text-muted)";
  }
}

export function AgentStatePanel({
  agentRows,
  runStats,
  lastRunAt,
  runStatus,
}: Props) {
  const isRunning = runStatus === "running";
  const totalItems = runStats?.total ?? null;

  return (
    <div
      style={{
        background: "var(--ct-surface-1)",
        border: "1px solid var(--ct-border)",
        borderRadius: RADIUS.lg,
        padding: `${SPACING.lx}px ${SPACING.xl}px`,
        boxShadow: "var(--ct-shadow-depth)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SPACING.lg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
          {isRunning && (
            <span
              className="ct-pulse-dot"
              style={{ display: "inline-block" }}
            />
          )}
          <span
            style={{
              fontSize: FONT.xs,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
            }}
          >
            Agent State
          </span>
        </div>
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--ct-text-faint)",
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.sm,
            padding: `2px ${SPACING.xxs}px`,
          }}
        >
          N3 · safe
        </span>
      </div>

      {/* Agent list */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xxs }}>
        {agentRows.map((agent) => (
          <div
            key={agent.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${SPACING.xxs}px 0`,
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: SPACING.sm,
                fontSize: FONT.base,
                color: "var(--ct-text-body)",
              }}
            >
              <span>{agent.icon}</span>
              <span>{agent.name}</span>
            </div>
            <span
              style={{
                fontSize: FONT.xs,
                fontWeight: 600,
                color: statusColor(agent.status),
              }}
            >
              {agent.statusLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: SPACING.lg,
          display: "flex",
          justifyContent: "space-between",
          fontSize: FONT.xs,
          color: "var(--ct-text-faint)",
        }}
      >
        <span>
          Dernier run · {lastRunAt ?? "Aucun run"} · {totalItems !== null ? totalItems : "—"} items
        </span>
        <span>Prochain · 18:30</span>
      </div>
    </div>
  );
}
