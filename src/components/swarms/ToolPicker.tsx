"use client";

import { useMemo } from "react";
import type { Tool, ToolBindingInput } from "@/lib/forms/swarmSchemas";
import { FONT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

interface ToolPickerProps {
  availableTools: Tool[];
  selectedBindings: ToolBindingInput[];
  onChange: (bindings: ToolBindingInput[]) => void;
  // F5 fix : agent_id désormais REQUIRED côté schema Zod
  // (option a — cohérence stricte avec tasks). Le picker exige donc un
  // agent sélectionné pour activer les toggles. Sans agent → message
  // d'aide + toggles désactivés.
  agentId?: string | null;
}

/**
 * Multi-select de tools avec regroupement par catégorie. Toggle on/off + priority.
 * F5 fix : `agentId` requis pour activer les toggles. Si null/undefined,
 * affichage informatif et boutons disabled — aucun binding orphelin créé.
 */
export function ToolPicker({
  availableTools,
  selectedBindings,
  onChange,
  agentId = null,
}: ToolPickerProps) {
  const byCategory = useMemo(() => {
    const map = new Map<string, Tool[]>();
    for (const t of availableTools) {
      if (!t.is_active) continue;
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [availableTools]);

  const selectedIds = useMemo(
    () => new Set(selectedBindings.map((b) => b.tool_id)),
    [selectedBindings],
  );

  const toggle = (tool: Tool) => {
    // F5 fix : refuse l'ajout sans agent — schema Zod rejetterait au save.
    if (!agentId && !selectedIds.has(tool.id)) return;
    if (selectedIds.has(tool.id)) {
      onChange(selectedBindings.filter((b) => b.tool_id !== tool.id));
    } else {
      onChange([
        ...selectedBindings,
        {
          tool_id: tool.id,
          agent_id: agentId as string,
          priority: 0,
          config_json: {},
        },
      ]);
    }
  };

  if (availableTools.length === 0) {
    return (
      <p className="ct-placeholder">
        Aucun tool disponible. Crée-en depuis la page Tools (à venir).
      </p>
    );
  }

  if (!agentId) {
    return (
      <p className="ct-placeholder">
        Sélectionne d&apos;abord un agent pour lui assigner des tools.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}>
      {Array.from(byCategory.entries()).map(([category, tools]) => (
        <div key={category}>
          <div
            style={{
              fontSize: FONT.xs,
              fontWeight: 700,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
              marginBottom: SPACING.sm,
            }}
          >
            {category}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: SPACING.sm,
            }}
          >
            {tools.map((tool) => {
              const isSelected = selectedIds.has(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => toggle(tool)}
                  style={{
                    background: isSelected
                      ? "var(--ct-accent-soft)"
                      : "var(--ct-surface-1)",
                    border: isSelected
                      ? "1px solid var(--ct-border-accent)"
                      : "1px solid var(--ct-border)",
                    borderRadius: RADIUS.md,
                    padding: `${SPACING.s}px ${SPACING.md}px`,
                    textAlign: "left",
                    color: "var(--ct-text-primary)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: FONT.base }}>
                    {tool.name}
                  </div>
                  {tool.description ? (
                    <div
                      style={{
                        fontSize: FONT.sm,
                        color: "var(--ct-text-muted)",
                        marginTop: SPACING.xs,
                      }}
                    >
                      {tool.description}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
