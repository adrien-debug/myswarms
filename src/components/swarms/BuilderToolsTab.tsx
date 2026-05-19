"use client";

import { useId, useState } from "react";
import { ToolPicker } from "./ToolPicker";
import type {
  AgentInput,
  Tool,
  ToolBindingInput,
} from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

/**
 * G8 fix : tab "Tools" + `ToolsPickerWithAgentSelector` extrait de SwarmBuilder.
 * F5 fix conservé : le picker exige un agent sélectionné (chaque binding doit
 * cibler un agent assignable, sinon il serait orphelin au moment du save).
 */
interface BuilderToolsTabProps {
  availableTools: Tool[];
  toolBindings: ToolBindingInput[];
  agents: AgentInput[];
  onChange: (bindings: ToolBindingInput[]) => void;
}

export function BuilderToolsTab({
  availableTools,
  toolBindings,
  agents,
  onChange,
}: BuilderToolsTabProps) {
  return (
    <div className="ct-card">
      <div className="ct-card-title">Tools liés</div>
      <ToolsPickerWithAgentSelector
        availableTools={availableTools}
        selectedBindings={toolBindings}
        onChange={onChange}
        agents={agents}
      />
    </div>
  );
}

// F5 fix : wrapper qui ajoute un select "Agent ciblé" au-dessus du ToolPicker.
function ToolsPickerWithAgentSelector({
  availableTools,
  selectedBindings,
  onChange,
  agents,
}: {
  availableTools: Tool[];
  selectedBindings: ToolBindingInput[];
  onChange: (bindings: ToolBindingInput[]) => void;
  agents: AgentInput[];
}) {
  // Seuls les agents persistés (avec id) sont assignables — sinon le binding
  // serait orphelin au moment du save.
  const assignableAgents = agents.filter((a) => a.id);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    assignableAgents[0]?.id ?? null,
  );
  const agentSelectId = useId();

  if (assignableAgents.length === 0) {
    return (
      <p className="ct-placeholder">
        Ajoute d&apos;abord un agent dans l&apos;onglet Agents pour pouvoir lui
        assigner des tools.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}>
      <label htmlFor={agentSelectId} style={{ display: "flex", flexDirection: "column", gap: SPACING.xxs }}>
        <span
          style={{
            fontSize: FONT.nano,
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.wide,
            textTransform: "uppercase",
            color: "var(--ct-text-muted)",
          }}
        >
          Agent ciblé
        </span>
        <select
          id={agentSelectId}
          value={selectedAgentId ?? ""}
          onChange={(e) => setSelectedAgentId(e.target.value || null)}
          style={{
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            padding: `${SPACING.s}px ${SPACING.md}px`,
            color: "var(--ct-text-primary)",
            fontSize: FONT.base,
            fontFamily: "inherit",
          }}
        >
          {assignableAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <ToolPicker
        availableTools={availableTools}
        selectedBindings={selectedBindings}
        onChange={onChange}
        agentId={selectedAgentId}
      />
    </div>
  );
}
