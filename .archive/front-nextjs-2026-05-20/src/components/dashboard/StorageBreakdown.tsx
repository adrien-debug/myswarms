interface Segment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: Segment[];
}

export function StorageBreakdown({ segments }: Props) {
  if (!segments || segments.length === 0) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">COST · 30D</div>
        <p className="ct-placeholder">No cost data available</p>
      </div>
    );
  }

  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="ct-card">
      <div className="ct-card-title">COST · 30D</div>
      <div className="ct-storage-bar">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="ct-storage-seg"
            style={{
              width: `${(seg.value / total) * 100}%`,
              background: seg.color,
            }}
          />
        ))}
      </div>
      <div className="ct-storage-legend">
        {segments.map((seg) => (
          <div key={seg.label} className="legend-row">
            <span className="legend-dot" style={{ background: seg.color }} />
            <span style={{ flex: 1 }}>{seg.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {seg.value.toFixed(2)}&nbsp;€
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
