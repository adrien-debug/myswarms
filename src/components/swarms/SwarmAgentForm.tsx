"use client";

import { useState } from "react";
import { LLMPicker } from "./LLMPicker";
import {
  type AgentInput,
  type AgentRole,
  type ModelProvider,
  AgentRoleSchema,
} from "@/lib/forms/swarmSchemas";
import { FONT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

interface SwarmAgentFormProps {
  initialAgent?: AgentInput;
  onSubmit: (agent: AgentInput) => void;
  onCancel?: () => void;
}

// C9 : aligné sur CLAUDE.md (Anthropic = claude-sonnet-4-6 par défaut).
const DEFAULT_AGENT: AgentInput = {
  name: "",
  role: "executor",
  system_prompt: "",
  model_provider: "anthropic",
  model_name: "claude-sonnet-4-6",
  temperature: 0.7,
  max_tokens: 4096,
  parent_agent_id: null,
  position_x: 0,
  position_y: 0,
};

export function SwarmAgentForm({
  initialAgent,
  onSubmit,
  onCancel,
}: SwarmAgentFormProps) {
  const [agent, setAgent] = useState<AgentInput>(initialAgent ?? DEFAULT_AGENT);

  const update = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => {
    setAgent((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(agent);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACING.lg }}>
        <label style={labelStyle}>
          <span style={labelText}>Nom</span>
          <input
            type="text"
            value={agent.name}
            onChange={(e) => update("name", e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={labelText}>Rôle</span>
          <select
            value={agent.role}
            onChange={(e) => update("role", e.target.value as AgentRole)}
            style={inputStyle}
          >
            {AgentRoleSchema.options.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        <span style={labelText}>System prompt</span>
        <textarea
          value={agent.system_prompt}
          onChange={(e) => update("system_prompt", e.target.value)}
          required
          rows={6}
          style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }}
        />
      </label>

      <LLMPicker
        provider={agent.model_provider}
        modelName={agent.model_name}
        temperature={agent.temperature}
        maxTokens={agent.max_tokens}
        onProviderChange={(p: ModelProvider) => update("model_provider", p)}
        onModelChange={(m) => update("model_name", m)}
        onTemperatureChange={(t) => update("temperature", t)}
        onMaxTokensChange={(t) => update("max_tokens", t)}
      />

      <div style={{ display: "flex", gap: SPACING.sm, justifyContent: "flex-end" }}>
        {onCancel ? (
          <button type="button" className="ct-seg-btn" onClick={onCancel}>
            Annuler
          </button>
        ) : null}
        <button type="submit" className="ct-seg-btn primary">
          {initialAgent ? "Mettre à jour" : "Ajouter agent"}
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xxs,
};
const labelText: React.CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: 600,
  letterSpacing: LETTER_SPACING.tight,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};
const inputStyle: React.CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
  outline: "none",
};
