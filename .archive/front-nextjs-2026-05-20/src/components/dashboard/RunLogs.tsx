interface Step {
  time: string;
  agent: string;
  action: string;
}

interface Props {
  steps: Step[];
}

export function RunLogs({ steps }: Props) {
  if (!steps || steps.length === 0) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">LIVE LOGS</div>
        <p className="ct-placeholder">No log — start a run to see activity</p>
      </div>
    );
  }

  const lines = steps.slice(-12);

  return (
    <div className="ct-card">
      <div className="ct-card-title">LIVE LOGS</div>
      <div className="ct-logs" role="log" aria-live="polite" aria-label="Agent activity logs">
        {lines.map((line, i) => (
          <div key={i} className="log-line">
            [{line.time}]{" "}
            <span className="log-tag">{line.action}</span>{" "}
            {line.agent}
            {i === lines.length - 1 && (
              <span className="cursor-blink" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
