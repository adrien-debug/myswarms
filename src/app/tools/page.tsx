import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import type { Tool } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "@/lib/ui/tokens";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function loadTools(): Promise<Tool[]> {
  try {
    const ownerId = await requireOwnerId();
    return await swarmsClient.listTools(ownerId);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      redirect("/login");
    }
    if (err instanceof SwarmEngineError && err.status === 404) {
      return [];
    }
    throw err;
  }
}

export default async function ToolsPage() {
  const tools = await loadTools();
  const grouped = tools.reduce<Record<string, Tool[]>>((acc, tool) => {
    const cat = tool.category ?? "Autres";
    (acc[cat] ??= []).push(tool);
    return acc;
  }, {});
  const categories = Object.entries(grouped).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <>
      <span className="ct-eyebrow">Catalogue</span>
      <h1 className="ct-title">Tools</h1>
      <p className="ct-sub">
        {tools.length} outil{tools.length > 1 ? "s" : ""} disponible
        {tools.length > 1 ? "s" : ""} pour vos agents.
      </p>

      {tools.length === 0 ? (
        <div className="ct-card">
          <div className="ct-card-title">Catalogue vide</div>
          <div className="ct-placeholder">
            L&apos;engine CrewAI ne référence aucun outil pour cet utilisateur.
            Provisionnez-en via la migration Supabase ou l&apos;API moteur.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: SPACING.xl,
          }}
        >
          {categories.map(([cat, list]) => (
            <section key={cat}>
              <div
                style={{
                  fontSize: FONT.xs,
                  fontWeight: FONT_WEIGHT.bold,
                  letterSpacing: LETTER_SPACING.wide,
                  textTransform: "uppercase",
                  color: "var(--ct-text-muted)",
                  marginBottom: SPACING.sm,
                }}
              >
                {cat} · {list.length}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(var(--ct-card-min-w), 1fr))",
                  gap: SPACING.md,
                }}
              >
                {list.map((tool) => (
                  <div
                    key={tool.id}
                    className="ct-card"
                    style={{ marginBottom: 0 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: SPACING.sm,
                        marginBottom: SPACING.xs,
                      }}
                    >
                      <div
                        style={{
                          fontSize: FONT.md,
                          fontWeight: FONT_WEIGHT.semibold,
                          color: "var(--ct-text-strong)",
                        }}
                      >
                        {tool.name}
                      </div>
                      {!tool.is_active ? (
                        <span
                          style={{
                            fontSize: FONT.xxs,
                            color: "var(--ct-text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: LETTER_SPACING.wide,
                          }}
                        >
                          inactif
                        </span>
                      ) : null}
                    </div>
                    {tool.description ? (
                      <div
                        style={{
                          fontSize: FONT.sm,
                          color: "var(--ct-text-body)",
                        }}
                      >
                        {tool.description}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
