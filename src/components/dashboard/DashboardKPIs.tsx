interface Props {
  runsToday: number;
  successRate: number;
  activeAgents: number;
  p0Count: number;
}

export function DashboardKPIs({ runsToday, successRate, activeAgents, p0Count }: Props) {
  return (
    <div className="ct-kpi-grid">
      <div className="ct-kpi-card accent">
        <span className="ct-kpi-label">Runs aujourd&apos;hui</span>
        <span className="ct-kpi-value">{runsToday}</span>
      </div>
      <div className="ct-kpi-card">
        <span className="ct-kpi-label">Taux de succès</span>
        <span className="ct-kpi-value">{successRate}%</span>
      </div>
      <div className="ct-kpi-card">
        <span className="ct-kpi-label">Agents actifs</span>
        <span className="ct-kpi-value">{activeAgents}</span>
      </div>
      <div className="ct-kpi-card">
        <span className="ct-kpi-label">P0 en attente</span>
        <span className="ct-kpi-value">{p0Count}</span>
      </div>
    </div>
  );
}
