interface Props {
  percent: number;
  label?: string;
}

export function SuccessCircle({ percent, label = "SUCCESS RATE" }: Props) {
  const radius = 36;
  const stroke = 6;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;

  return (
    <div className="ct-card">
      <div className="ct-card-title">{label}</div>
      <div className="ct-circle">
        <svg
          className="ct-circle-svg"
          width={radius * 2}
          height={radius * 2}
          viewBox={`0 0 ${radius * 2} ${radius * 2}`}
          aria-label={`Success rate: ${percent}%`}
        >
          <circle
            className="ct-circle-bg"
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            strokeWidth={stroke}
          />
          <circle
            className="ct-circle-fg"
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
          />
          <text
            className="ct-circle-text"
            x={radius}
            y={radius}
            fontSize="14"
            style={{ transform: "rotate(90deg)", transformOrigin: `${radius}px ${radius}px` }}
          >
            {percent}%
          </text>
        </svg>
      </div>
    </div>
  );
}
