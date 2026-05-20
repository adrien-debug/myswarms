import { SPACING } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement du dashboard / — affiché pendant le fetch
 * serveur (cold-start engine CrewAI, auth, runs). Évite l'écran blanc.
 */
export default function HomeLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Header skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: SPACING.xl,
        }}
      >
        <div>
          <div
            style={{
              width: 200,
              height: 28,
              background: "var(--ct-surface-2)",
              borderRadius: 4,
              opacity: 0.5,
              marginBottom: SPACING.sm,
            }}
          />
          <div
            style={{
              width: 340,
              height: 14,
              background: "var(--ct-surface-2)",
              borderRadius: 4,
              opacity: 0.4,
              marginBottom: SPACING.sm,
            }}
          />
          <div
            style={{
              width: 160,
              height: 12,
              background: "var(--ct-surface-2)",
              borderRadius: 4,
              opacity: 0.3,
            }}
          />
        </div>
        {/* KickoffForm skeleton */}
        <div
          style={{
            width: 120,
            height: 36,
            background: "var(--ct-surface-2)",
            borderRadius: 8,
            opacity: 0.5,
          }}
        />
      </div>

      {/* 3-column grid skeleton: AgentStatePanel | main | AgentDiff */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "var(--ct-rail-width) 1fr var(--ct-rail-width)",
          gap: SPACING.md,
          alignItems: "start",
        }}
      >
        {/* AgentStatePanel skeleton */}
        <div
          className="ct-card"
          style={{ opacity: 0.5, minHeight: 320, marginBottom: 0 }}
        />

        {/* Centre: DecisionCard + DayTimeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}>
          <div
            className="ct-card"
            style={{ opacity: 0.5, minHeight: 180, marginBottom: 0 }}
          />
          <div
            className="ct-card"
            style={{ opacity: 0.45, minHeight: 96, marginBottom: 0 }}
          />
        </div>

        {/* AgentDiff skeleton */}
        <div
          className="ct-card"
          style={{ opacity: 0.5, minHeight: 320, marginBottom: 0 }}
        />
      </div>

      {/* Product bets section skeleton */}
      <div style={{ marginTop: SPACING.xxl }}>
        <div
          className="ct-eyebrow"
          style={{
            width: 120,
            height: 12,
            background: "var(--ct-surface-2)",
            borderRadius: 4,
            opacity: 0.5,
            marginBottom: SPACING.lg,
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: SPACING.md,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="ct-card"
              style={{ marginBottom: 0, opacity: 0.4, minHeight: 80 }}
            />
          ))}
        </div>
      </div>

      <p className="ct-sub" style={{ marginTop: SPACING.xl }}>
        Loading…
      </p>
    </div>
  );
}
