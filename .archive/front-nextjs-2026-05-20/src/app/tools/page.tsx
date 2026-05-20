import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import type { Tool } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "@/lib/ui/tokens";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function loadTools(): Promise<{ tools: Tool[]; engineError: string | null }> {
  try {
    const ownerId = await requireOwnerId();
    const tools = await swarmsClient.listTools(ownerId);
    return { tools, engineError: null };
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      redirect("/login");
    }
    if (err instanceof SwarmEngineError && err.status === 404) {
      return { tools: [], engineError: null };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return { tools: [], engineError: message };
  }
}

export default async function ToolsPage() {
  const { tools, engineError } = await loadTools();
  const grouped = tools.reduce<Record<string, Tool[]>>((acc, tool) => {
    const cat = tool.category ?? "Other";
    (acc[cat] ??= []).push(tool);
    return acc;
  }, {});
  const categories = Object.entries(grouped).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <>
      <span className="ct-eyebrow">Catalog</span>
      <h1 className="ct-title">Tools</h1>
      <p className="ct-sub">
        {tools.length} tool{tools.length > 1 ? "s" : ""} available for your agents.
      </p>

      {engineError ? (
        <div
          className="ct-card"
          style={{
            background: "var(--ct-alert-warning-bg)",
            borderColor: "var(--ct-alert-warning-border)",
          }}
        >
          <div
            className="ct-card-title"
            style={{ color: "var(--ct-alert-warning-text)" }}
          >
            CrewAI engine unreachable
          </div>
          <div className="ct-card-body">
            <code>{engineError}</code>
            <div style={{ marginTop: SPACING.sm }}>
              Start the Python microservice to see the catalog:{" "}
              <code>
                cd services/crewai-engine &amp;&amp; uv run uvicorn src.main:app
                --reload --port 8000
              </code>
            </div>
          </div>
        </div>
      ) : tools.length === 0 ? (
        <div className="ct-card">
          <div className="ct-card-title">Empty catalog</div>
          <div className="ct-placeholder">
            The CrewAI engine references no tool for this user.
            Provision some via Supabase migration or the engine API.
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
                          inactive
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
