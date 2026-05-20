import type { CSSProperties } from "react";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";

const STATUS_STYLES: Record<string, CSSProperties> = {
  completed: { background: "var(--ct-status-completed-bg)", color: "var(--ct-status-completed)", border: "1px solid var(--ct-status-completed-border)" },
  running: { background: "var(--ct-status-running-bg)", color: "var(--ct-status-running)", border: "1px solid var(--ct-status-running-border)" },
  failed: { background: "var(--ct-status-failed-bg)", color: "var(--ct-status-failed)", border: "1px solid var(--ct-status-failed-border)" },
  cancelled: { background: "var(--ct-status-cancelled-bg)", color: "var(--ct-status-cancelled)", border: "1px solid var(--ct-status-cancelled-border)" },
  paused_hitl: { background: "var(--ct-status-paused-bg)", color: "var(--ct-status-paused)", border: "1px solid var(--ct-status-paused-border)" },
  pending: { background: "var(--ct-surface-2)", color: "var(--ct-text-muted)", border: "1px solid var(--ct-border)" },
};

const BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  borderRadius: RADIUS.full,
  fontSize: FONT.xxs,
  fontWeight: FONT_WEIGHT.medium,
  whiteSpace: "nowrap",
};

export function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const statusStyle = STATUS_STYLES[status] ?? { background: "var(--ct-surface-2)", color: "var(--ct-text-muted)", border: "1px solid var(--ct-border)" };
  const padding: CSSProperties = size === "md"
    ? { padding: `${SPACING.xs}px ${SPACING.s}px` }
    : { padding: `${SPACING.hair}px ${SPACING.sm}px` };
  return (
    <span style={{ ...BASE_STYLE, ...statusStyle, ...padding }}>
      {status}
    </span>
  );
}
