import { SPACING, FONT, RADIUS } from "@/lib/ui/tokens";
import type { DiffItem } from "@/lib/crews/chiefTypes";

interface Props {
  items: DiffItem[];
  sinceLabel: string;
  elapsed: string;
}

// Largeur minimale de la colonne temps — pas de token exact, const locale documentée.
const TIME_COL_W = 38;

/**
 * Parse bold markdown (**text**) and render alternating plain/bold segments.
 * Bold segments get color: var(--cos-warn).
 */
function parseBold(text: string): React.ReactNode {
  const parts = text.split("**");
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <strong key={i} style={{ color: "var(--cos-warn)", fontWeight: 700 }}>
          {part}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function AgentDiff({ items, sinceLabel, elapsed }: Props) {
  return (
    <div
      style={{
        background: "var(--ct-surface-1)",
        border: "1px solid var(--ct-border)",
        borderRadius: RADIUS.lg,
        padding: `${SPACING.lx}px ${SPACING.xl}px`,
        boxShadow: "var(--ct-shadow-depth)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SPACING.lg,
        }}
      >
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ct-text-muted)",
          }}
        >
          Agent Diff · {sinceLabel}
        </span>
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--ct-text-faint)",
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.sm,
            padding: `2px ${SPACING.xxs}px`,
          }}
        >
          {elapsed}
        </span>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div
          style={{
            fontSize: FONT.base,
            color: "var(--ct-text-faint)",
            fontStyle: "italic",
            textAlign: "center",
            padding: `${SPACING.xl}px 0`,
          }}
        >
          Aucun diff · Lance un run pour voir l&apos;activité des agents
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.hair }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: SPACING.md,
                padding: `${SPACING.xxs}px 0`,
                borderBottom: "1px solid var(--ct-border-soft)",
              }}
            >
              {/* Time */}
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: FONT.xs,
                  color: "var(--ct-text-muted)",
                  minWidth: TIME_COL_W,
                  flexShrink: 0,
                  lineHeight: 1.6,
                  paddingTop: 1,
                }}
              >
                {item.time}
              </span>

              {/* Text */}
              <span
                style={{
                  fontSize: FONT.base,
                  color: "var(--ct-text-body)",
                  lineHeight: 1.6,
                }}
              >
                {parseBold(item.text)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: SPACING.lg,
          fontSize: FONT.xs,
          color: "var(--ct-text-muted)",
          fontStyle: "italic",
        }}
      >
        Tap une ligne pour corriger → entraîne Memory
      </div>
    </div>
  );
}
