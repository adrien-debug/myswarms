import type { TimelineMarker } from "@/lib/crews/chiefTypes";

interface Props {
  markers: TimelineMarker[];
}

// Hauteur fixe du rail (px)
const RAIL_H = 8;
// Réserve pour les labels au-dessus/en dessous du rail
const LABEL_RESERVE = 24;
// Hauteur totale de la zone des markers
const ROW_H = 40;

function dotBackground(variant: TimelineMarker["variant"]): string {
  switch (variant) {
    case "done":
      return "var(--ct-accent-strong)";
    case "now":
      return "var(--ct-accent)";
    case "future":
      return "var(--ct-border-strong)";
  }
}

function labelColor(variant: TimelineMarker["variant"]): string {
  switch (variant) {
    case "done":
      return "var(--ct-text-muted)";
    case "now":
      return "var(--cos-warn)";
    case "future":
      return "var(--ct-text-faint)";
  }
}

export function DayTimeline({ markers }: Props) {
  if (markers.length === 0) return null;

  const nowMarker = markers.find((m) => m.variant === "now");
  const fillPercent = nowMarker?.leftPercent ?? 0;

  return (
    <div className="ct-card">
      <div className="ct-card-title">TIMELINE</div>
      <div
        style={{
          position: "relative",
          height: ROW_H + 2 * LABEL_RESERVE,
          paddingTop: LABEL_RESERVE,
          paddingBottom: LABEL_RESERVE,
        }}
      >
        {/* Rail background */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: RAIL_H,
            background: "var(--ct-surface-2)",
            transform: "translateY(-50%)",
            borderRadius: 4,
          }}
        />

        {/* Rail fill jusqu'au marqueur "now" */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: `${fillPercent}%`,
            height: RAIL_H,
            background: "var(--ct-accent-strong)",
            transform: "translateY(-50%)",
            borderRadius: 4,
            transition: "width 0.4s var(--ct-ease)",
          }}
        />

        {/* Markers */}
        <div role="list" style={{ position: "absolute", inset: 0 }}>
          {markers.map((marker, i) => (
            <div
              key={i}
              role="listitem"
              aria-label={`${marker.time} — ${marker.label}`}
              style={{
                position: "absolute",
                left: `${marker.leftPercent}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
              }}
            >
              {/* Label au-dessus */}
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ct-text-muted)",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {marker.time}
              </div>

              {/* Dot */}
              <div
                style={{
                  width: marker.variant === "now" ? 12 : 10,
                  height: marker.variant === "now" ? 12 : 10,
                  borderRadius: "50%",
                  background: dotBackground(marker.variant),
                  ...(marker.variant === "now"
                    ? { boxShadow: "var(--ct-shadow-now-glow)" }
                    : {}),
                }}
              />

              {/* Label en dessous */}
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: 10,
                  color: labelColor(marker.variant),
                  whiteSpace: "nowrap",
                  fontWeight: marker.variant === "now" ? 600 : 400,
                }}
              >
                {marker.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
