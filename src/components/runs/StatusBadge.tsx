import type { CSSProperties } from "react";

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
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

export function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const statusStyle = STATUS_STYLES[status] ?? { background: "var(--ct-surface-2)", color: "var(--ct-text-muted)", border: "1px solid var(--ct-border)" };
  const padding: CSSProperties = size === "md" ? { padding: "4px 10px" } : { padding: "2px 8px" };
  return (
    <span style={{ ...BASE_STYLE, ...statusStyle, ...padding }}>
      {status}
    </span>
  );
}
