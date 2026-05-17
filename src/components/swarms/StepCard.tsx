import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmRunStep } from "@/lib/forms/swarmSchemas";
import { FONT, RADIUS, SPACING } from "@/lib/ui/tokens";

interface StepCardProps {
  step: SwarmRunStep;
}

// H6 : hauteur max du bloc output preview — valeur visuelle dédiée,
// pas dans SPACING (cas spécifique).
const OUTPUT_MAX_HEIGHT = 240;

export function StepCard({ step }: StepCardProps) {
  const totalTokens = step.tokens_in + step.tokens_out;
  return (
    <div className="ct-card" style={{ marginBottom: SPACING.md }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SPACING.sm,
          flexWrap: "wrap",
          gap: SPACING.sm,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACING.md,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: FONT.xs,
              color: "var(--ct-text-muted)",
            }}
          >
            #{String(step.step_number).padStart(3, "0")}
          </span>
          <span style={{ fontWeight: 600, color: "var(--ct-text-strong)" }}>
            {step.agent_name ?? "agent inconnu"}
          </span>
          {step.task_name ? (
            <span style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)" }}>
              → {step.task_name}
            </span>
          ) : null}
        </div>
        <StatusBadge status={step.status} />
      </div>

      <div
        style={{
          display: "flex",
          gap: SPACING.lg,
          flexWrap: "wrap",
          fontSize: FONT.xs,
          color: "var(--ct-text-muted)",
          marginBottom: step.output_text || step.error_text ? SPACING.md : 0,
        }}
      >
        <span>tokens: {totalTokens}</span>
        <span>cost: ${step.cost_usd.toFixed(4)}</span>
        {step.latency_ms ? <span>latency: {step.latency_ms}ms</span> : null}
        <span>start: {formatDate(step.created_at, { withSeconds: true })}</span>
        {step.finished_at ? (
          <span>
            end: {formatDate(step.finished_at, { withSeconds: true })}
          </span>
        ) : null}
      </div>

      {step.error_text ? (
        <pre
          style={{
            background: "var(--ct-accent-soft)",
            border: "1px solid var(--ct-border-accent)",
            borderRadius: RADIUS.md,
            padding: SPACING.md,
            fontSize: FONT.sm,
            color: "var(--ct-text-primary)",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {step.error_text}
        </pre>
      ) : step.output_text ? (
        <pre
          style={{
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            padding: SPACING.md,
            fontSize: FONT.sm,
            color: "var(--ct-text-primary)",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: OUTPUT_MAX_HEIGHT,
          }}
        >
          {step.output_text}
        </pre>
      ) : null}
    </div>
  );
}
