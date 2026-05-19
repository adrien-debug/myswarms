interface Props {
  values: number[];
}

export function RunsSparkline({ values }: Props) {
  const hasData = values.length > 0 && values.some((v) => v > 0);

  if (!hasData) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">RUNS · 7J</div>
        <p className="ct-placeholder">Aucune donnée — lance un premier run</p>
      </div>
    );
  }

  const width = 300;
  const height = 60;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);

  const points = values.map((v, i) => ({
    x: i * step,
    y: height - (v / max) * (height - 8) - 4,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    `${linePath} L${(values.length - 1) * step},${height} L0,${height} Z`;

  return (
    <div className="ct-card">
      <div className="ct-card-title">RUNS · 7J</div>
      <svg
        className="ct-sparkline"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-label="Sparkline des runs sur 7 jours"
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ct-accent-strong)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--ct-accent-strong)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--ct-accent-strong)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
