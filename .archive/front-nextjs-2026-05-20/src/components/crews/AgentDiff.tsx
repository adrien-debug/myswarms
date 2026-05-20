import type { DiffItem } from "@/lib/crews/chiefTypes";
import { SIZE, FONT, FONT_WEIGHT, LINE_HEIGHT } from "@/lib/ui/tokens";

interface Props {
  items: DiffItem[];
  sinceLabel: string;
  elapsed: string;
}

// Largeur minimale de la colonne temps (px)
const TIME_COL_W = SIZE.agentDiffTimeCol;

/**
 * Parse bold markdown (**text**) et render des segments alternés plain/bold.
 * Les segments gras reçoivent color: var(--ct-accent-strong).
 */
function parseBold(text: string): React.ReactNode {
  const parts = text.split("**");
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <strong key={i} style={{ color: "var(--ct-accent-strong)", fontWeight: FONT_WEIGHT.bold }}>
          {part}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function AgentDiff({ items, sinceLabel, elapsed }: Props) {
  return (
    <div className="ct-card">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <span className="ct-card-title" style={{ marginBottom: 0 }}>
          Agent Diff · {sinceLabel}
        </span>
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: FONT_WEIGHT.semibold,
            color: "var(--ct-text-faint)",
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          {elapsed}
        </span>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <p className="ct-placeholder" style={{ textAlign: "center", padding: "24px 0" }}>
          No diff · Start a run to see agent activity
        </p>
      ) : (
        <div className="activity-list" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((item, i) => (
            <div
              key={i}
              className="activity-item"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "4px 0",
                borderBottom: "1px solid var(--ct-border-soft)",
                cursor: "default",
              }}
            >
              {/* Time */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: FONT.xxs,
                  color: "var(--ct-text-muted)",
                  minWidth: TIME_COL_W,
                  flexShrink: 0,
                  lineHeight: LINE_HEIGHT.base,
                  paddingTop: 1,
                }}
              >
                {item.time}
              </span>

              {/* Agent name + text */}
              <span
                style={{
                  fontSize: FONT.base,
                  color: "var(--ct-text-body)",
                  lineHeight: LINE_HEIGHT.base,
                }}
              >
                <span style={{ color: "var(--ct-text-primary)", fontWeight: FONT_WEIGHT.semibold }}>
                  {item.agentName}
                </span>{" "}
                {parseBold(item.text)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 16,
          fontSize: FONT.xxs,
          color: "var(--ct-text-muted)",
          fontStyle: "italic",
        }}
      >
        Tap a row to correct: trains Memory
      </div>
    </div>
  );
}
