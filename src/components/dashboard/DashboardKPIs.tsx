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
        <span className="ct-kpi-label">Runs today</span>
        <span className="ct-kpi-value">{runsToday}</span>
      </div>
      <div className="ct-kpi-card">
        <span className="ct-kpi-label">Success rate</span>
        <span className="ct-kpi-value">{successRate}%</span>
      </div>
      <div className="ct-kpi-card">
        <span className="ct-kpi-label">Active agents</span>
        <span className="ct-kpi-value">{activeAgents}</span>
      </div>
      <div className="ct-kpi-card">
        <span className="ct-kpi-label">P0 pending</span>
        <span className="ct-kpi-value">{p0Count}</span>
      </div>
    </div>
  );
}
