import { FONT, SPACING } from "@/lib/ui/tokens";

interface LiveIndicatorProps {
  intervalSeconds?: number;
}

export function LiveIndicator({ intervalSeconds = 5 }: LiveIndicatorProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: SPACING.xs,
        fontSize: FONT.sm,
        color: "var(--ct-text-muted)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <span className="ct-pulse-dot" />
      Live · auto-refresh ({intervalSeconds}s)
    </span>
  );
}
