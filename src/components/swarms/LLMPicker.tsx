"use client";

import type { ModelProvider } from "@/lib/forms/swarmSchemas";
import { FONT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

interface LLMPickerProps {
  provider: ModelProvider;
  modelName: string;
  temperature: number;
  maxTokens: number;
  onProviderChange: (provider: ModelProvider) => void;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temp: number) => void;
  onMaxTokensChange: (tokens: number) => void;
}

// C9 : alignement avec CLAUDE.md + services/crewai-engine/src/config.py.
// Note : "kimi" et "hypercli" pointent vers les mêmes modèles (alias historique
// vs alias officiel) — l'engine accepte les deux.
const HYPERCLI_MODELS = [
  "kimi-k2.6",
  "kimi-k2.6-anthropic",
  "kimi-k2.5",
  "kimi-k2.5-anthropic",
  "glm-5",
  "minimax-m2.5",
  "qwen3-embedding-4b",
];

const PROVIDER_MODELS: Record<ModelProvider, string[]> = {
  anthropic: [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ],
  openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
  kimi: HYPERCLI_MODELS,
  hypercli: HYPERCLI_MODELS,
};

const TEMP_MIN = 0;
const TEMP_MAX = 2;
const TEMP_STEP = 0.1;
const MAX_TOKENS_MIN = 256;
const MAX_TOKENS_MAX = 200_000;

export function LLMPicker({
  provider,
  modelName,
  temperature,
  maxTokens,
  onProviderChange,
  onModelChange,
  onTemperatureChange,
  onMaxTokensChange,
}: LLMPickerProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACING.lg }}>
      <label style={labelStyle}>
        <span style={labelText}>Provider</span>
        <select
          value={provider}
          onChange={(e) => {
            const next = e.target.value as ModelProvider;
            onProviderChange(next);
            const firstModel = PROVIDER_MODELS[next][0];
            if (firstModel) onModelChange(firstModel);
          }}
          style={inputStyle}
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
          <option value="hypercli">Hypercli (officiel)</option>
          <option value="kimi">Kimi (alias historique)</option>
        </select>
      </label>

      <label style={labelStyle}>
        <span style={labelText}>Modèle</span>
        <select
          value={modelName}
          onChange={(e) => onModelChange(e.target.value)}
          style={inputStyle}
        >
          {PROVIDER_MODELS[provider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {!PROVIDER_MODELS[provider].includes(modelName) && modelName ? (
            <option value={modelName}>{modelName} (custom)</option>
          ) : null}
        </select>
      </label>

      <label style={labelStyle}>
        <span style={labelText}>
          Température : <strong>{temperature.toFixed(1)}</strong>
        </span>
        <input
          type="range"
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={TEMP_STEP}
          value={temperature}
          onChange={(e) => onTemperatureChange(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </label>

      <label style={labelStyle}>
        <span style={labelText}>Max tokens</span>
        <input
          type="number"
          min={MAX_TOKENS_MIN}
          max={MAX_TOKENS_MAX}
          value={maxTokens}
          onChange={(e) => onMaxTokensChange(Number(e.target.value))}
          style={inputStyle}
        />
      </label>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xs + 2,
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
