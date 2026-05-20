import { SPACING } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement du catalogue Tools — affiché pendant le fetch
 * serveur (engine CrewAI). Évite l'écran figé si le moteur est lent/froid.
 */
export default function ToolsLoading() {
  return (
    <>
      <span className="ct-eyebrow">Catalog</span>
      <h1 className="ct-title">Tools</h1>
      <p className="ct-sub">Loading catalog…</p>

      <div
        aria-busy="true"
        aria-live="polite"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(var(--ct-card-min-w), 1fr))",
          gap: SPACING.md,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="ct-card"
            style={{
              marginBottom: 0,
              opacity: 0.5,
              minHeight: 96,
            }}
          />
        ))}
      </div>
    </>
  );
}
