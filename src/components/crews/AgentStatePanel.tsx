import type { AgentRow, RunStats } from "@/lib/crews/chiefTypes";

interface Props {
  agentRows: AgentRow[];
  runStats: RunStats | null;
  lastRunAt: string | null;
  runStatus: string | null;
}

function initialsColor(status: AgentRow["status"]): string {
  switch (status) {
    case "active":
      return "var(--ct-accent-strong)";
    case "idle":
    case "pending":
      return "var(--ct-text-muted)";
  }
}

function badgeClass(status: AgentRow["status"]): string {
  switch (status) {
    case "active":
      return "status-badge nominal";
    case "idle":
      return "status-badge";
    case "pending":
      return "status-badge warn";
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
    <div className="ct-card">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {isRunning && (
          <span className="ct-pulse-dot" style={{ display: "inline-block" }} />
        )}
        <span className="ct-card-title" style={{ marginBottom: 0 }}>
          Agent State
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--ct-text-faint)",
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          N3 · safe
        </span>
      </div>

      {/* Agent list */}
      <div className="activity-list" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {agentRows.map((agent) => (
          <div
            key={agent.name}
            className="activity-item"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 0",
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: initialsColor(agent.status),
                  background: "var(--ct-surface-2)",
                  border: "1px solid var(--ct-border)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  letterSpacing: "0.08em",
                  flexShrink: 0,
                }}
              >
                {agent.initials}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--ct-text-body)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {agent.name}
              </span>
            </div>
            <span className={badgeClass(agent.status)}>
              {agent.statusLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="ct-card-body"
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
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
