import type { DiffItem } from "@/lib/crews/chiefTypes";

interface Props {
  items: DiffItem[];
  sinceLabel: string;
  elapsed: string;
}

// Largeur minimale de la colonne temps (px)
const TIME_COL_W = 38;

/**
 * Parse bold markdown (**text**) et render des segments alternés plain/bold.
 * Les segments gras reçoivent color: var(--ct-accent-strong).
 */
function parseBold(text: string): React.ReactNode {
  const parts = text.split("**");
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <strong key={i} style={{ color: "var(--ct-accent-strong)", fontWeight: 700 }}>
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
            fontSize: 10,
            fontWeight: 600,
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
          Aucun diff · Lance un run pour voir l&apos;activité des agents
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
                  fontSize: 11,
                  color: "var(--ct-text-muted)",
                  minWidth: TIME_COL_W,
                  flexShrink: 0,
                  lineHeight: 1.6,
                  paddingTop: 1,
                }}
              >
                {item.time}
              </span>

              {/* Agent name + text */}
              <span
                style={{
                  fontSize: 13,
                  color: "var(--ct-text-body)",
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: "var(--ct-text-primary)", fontWeight: 600 }}>
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
          fontSize: 11,
          color: "var(--ct-text-muted)",
          fontStyle: "italic",
        }}
      >
        Tap une ligne pour corriger : entraîne Memory
      </div>
    </div>
  );
}
