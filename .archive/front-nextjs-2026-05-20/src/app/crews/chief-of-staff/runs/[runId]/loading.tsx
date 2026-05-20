import { SPACING } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement de la page détail d'un run Chief of Staff.
 * Affiché pendant le fetch serveur (cold-start engine possible).
 */
export default function ChiefRunLoading() {
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
          marginBottom: SPACING.md,
        }}
      />

      {/* Titre skeleton */}
      <div
        style={{
          width: 180,
          height: 28,
          background: "var(--ct-surface-2)",
          borderRadius: 4,
          opacity: 0.5,
          marginBottom: SPACING.sm,
        }}
      />

      {/* StatusBadge + trigger skeleton */}
      <div
        style={{
          display: "flex",
          gap: SPACING.md,
          alignItems: "center",
          marginBottom: SPACING.xl,
        }}
      >
        <div
          style={{
            width: 72,
            height: 22,
            background: "var(--ct-surface-2)",
            borderRadius: 9999,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: 8,
            height: 8,
            background: "var(--ct-surface-2)",
            borderRadius: 9999,
            opacity: 0.4,
          }}
        />
        <div
          style={{
            width: 110,
            height: 14,
            background: "var(--ct-surface-2)",
            borderRadius: 4,
            opacity: 0.4,
          }}
        />
      </div>

      {/* Dates grid skeleton — 2 cards */}
      <div
        aria-busy="true"
        aria-live="polite"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: SPACING.lg,
          marginBottom: SPACING.xl,
        }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="ct-card"
            style={{ marginBottom: 0, opacity: 0.5, minHeight: 64 }}
          />
        ))}
      </div>

      {/* Résultat card skeleton */}
      <div
        className="ct-eyebrow"
        style={{
          width: 60,
          height: 14,
          background: "var(--ct-surface-2)",
          borderRadius: 4,
          opacity: 0.5,
          marginBottom: SPACING.sm,
        }}
      />
      <div
        className="ct-card"
        style={{ opacity: 0.5, minHeight: 120, marginBottom: SPACING.xl }}
      />

      {/* State card skeleton */}
      <div
        className="ct-eyebrow"
        style={{
          width: 50,
          height: 14,
          background: "var(--ct-surface-2)",
          borderRadius: 4,
          opacity: 0.5,
          marginBottom: SPACING.sm,
        }}
      />
      <div
        className="ct-card"
        style={{ opacity: 0.45, minHeight: 80 }}
      />

      <p className="ct-sub">Loading run…</p>
    </>
  );
}
