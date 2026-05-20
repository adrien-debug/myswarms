import { SPACING } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement de l'historique Chief of Staff — affiché pendant
 * le fetch serveur (crewaiClient.listRuns). Évite l'écran blanc.
 */
export default function HistoryLoading() {
  return (
    <>
      {/* Breadcrumb skeleton */}
      <div
        style={{
          width: 80,
          height: 14,
          background: "var(--ct-surface-2)",
          borderRadius: 4,
          opacity: 0.5,
          marginBottom: SPACING.sm,
        }}
      />

      {/* Titre + sous-titre */}
      <div style={{ marginTop: SPACING.sm, marginBottom: SPACING.xl }}>
        <div
          style={{
            width: 220,
            height: 28,
            background: "var(--ct-surface-2)",
            borderRadius: 4,
            opacity: 0.5,
            marginBottom: SPACING.xs,
          }}
        />
        <div
          style={{
            width: 260,
            height: 14,
            background: "var(--ct-surface-2)",
            borderRadius: 4,
            opacity: 0.4,
          }}
        />
      </div>

      {/* Section runs skeleton */}
      <section aria-busy="true" aria-live="polite">
        <div
          style={{
            width: 100,
            height: 12,
            background: "var(--ct-surface-2)",
            borderRadius: 4,
            opacity: 0.5,
            marginBottom: SPACING.md,
          }}
        />

        {/* Tableau runs skeleton */}
        <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
          {/* En-tête */}
          <div
            style={{
              height: 40,
              background: "var(--ct-surface-2)",
              opacity: 0.5,
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          />
          {/* Lignes */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 48,
                background: "var(--ct-surface-2)",
                opacity: i % 2 === 0 ? 0.45 : 0.3,
                borderBottom: "1px solid var(--ct-border-soft)",
              }}
            />
          ))}
        </div>
      </section>

      <p className="ct-sub" style={{ marginTop: SPACING.md }}>
        Loading…
      </p>
    </>
  );
}
