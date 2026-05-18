import { FONT, LETTER_SPACING, SPACING } from "@/lib/ui/tokens";
import type { CSSProperties } from "react";

const style: CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: 700,
  letterSpacing: LETTER_SPACING.wide,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
  display: "block",
  marginBottom: SPACING.sm,
};

export function SectionLabel({ text, mb }: { text: string; mb?: number }) {
  return (
    <span style={mb !== undefined ? { ...style, marginBottom: mb } : style}>
      {text}
    </span>
  );
}
