import { SPACING, FONT, FONT_WEIGHT, LINE_HEIGHT } from "@/lib/ui/tokens";

const CARDS = [
  {
    icon: "🪞",
    title: "Chief Replay",
    desc: "Temporal scrubber that replays agent decisions minute by minute. Pause at any point, correct a priority, the agent learns retroactively. Unique moat.",
  },
  {
    icon: "🌅",
    title: "Shadow Day",
    desc: "At 07:00, the agent simulates your day if you do nothing (emails rotting, meetings dropped, deadlines missed). Validate or rewrite the scenario.",
  },
  {
    icon: "🤝",
    title: "Trust Score",
    desc: "Score learned per contact (response latency, tone, sensitivity). The agent refuses a draft that's too cold for a P0. Visible and editable.",
  },
] as const;

export function ProductBets() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: SPACING.lg,
      }}
    >
      {CARDS.map((card) => (
        <div
          key={card.title}
          className="ct-card"
          style={{
            borderTop: "2px solid var(--cos-accent)",
            display: "flex",
            flexDirection: "column",
            gap: SPACING.md,
          }}
        >
          {/* Title + icon */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACING.sm,
            }}
          >
            <span style={{ fontSize: FONT.xl }}>{card.icon}</span>
            <span
              style={{
                fontSize: FONT.base,
                fontWeight: FONT_WEIGHT.bold,
                color: "var(--ct-text-primary)",
              }}
            >
              {card.title}
            </span>
          </div>

          {/* Description */}
          <p
            style={{
              fontSize: FONT.base,
              color: "var(--ct-text-body)",
              lineHeight: LINE_HEIGHT.base,
              margin: 0,
            }}
          >
            {card.desc}
          </p>
        </div>
      ))}
    </div>
  );
}
