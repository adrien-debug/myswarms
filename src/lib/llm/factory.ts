/**
 * LLM client factory — sélection tier-based (fast/balanced/smart/fallback).
 *
 * USAGE : utilisé par les futurs agents server-side (route handlers + actions)
 * pour piocher dynamiquement le bon client selon le tier de tâche. Pas appelé
 * dans la V1 squelette "Hello World" — sera consommé quand les 8 agents
 * Daily Chief of Staff seront branchés (Phase B.7).
 *
 * Ne pas créer de nouveaux singletons LLM ailleurs : tout passe par cette factory
 * (règle CLAUDE.md "JAMAIS créer un client LLM sans passer par src/lib/llm/").
 *
 * @see crewai_architecture_decision memory entry
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type LLMTier = "fast" | "balanced" | "smart" | "fallback";

const FAST_MODEL =
  process.env.CREWAI_DEFAULT_FAST_MODEL ?? "claude-haiku-4-5-20251001";
const BALANCED_MODEL =
  process.env.CREWAI_DEFAULT_BALANCED_MODEL ?? "claude-sonnet-4-6";
const SMART_MODEL =
  process.env.CREWAI_DEFAULT_SMART_MODEL ?? "claude-opus-4-7";
const FALLBACK_MODEL =
  process.env.HYPERCLI_DEFAULT_MODEL ?? "kimi-k2.6";

type AnthropicResult = {
  provider: "anthropic";
  client: Anthropic;
  model: string;
};

type KimiResult = {
  provider: "kimi";
  client: OpenAI;
  model: string;
};

export type LLMClientResult = AnthropicResult | KimiResult;

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getKimiClient(): OpenAI {
  if (!process.env.HYPERCLI_API_KEY || !process.env.HYPERCLI_BASE_URL) {
    throw new Error("HYPERCLI_API_KEY or HYPERCLI_BASE_URL missing");
  }
  return new OpenAI({
    apiKey: process.env.HYPERCLI_API_KEY,
    baseURL: process.env.HYPERCLI_BASE_URL,
  });
}

/**
 * Returns a typed LLM client + model name based on the requested tier.
 *
 * - fast      → Claude Haiku (Anthropic)
 * - balanced  → Claude Sonnet (Anthropic)
 * - smart     → Claude Opus (Anthropic)
 * - fallback  → Hypercli Kimi K2.6 (OpenAI-compatible)
 */
export function getLLMClient(tier: LLMTier = "balanced"): LLMClientResult {
  switch (tier) {
    case "fast":
      return { provider: "anthropic", client: getAnthropicClient(), model: FAST_MODEL };
    case "balanced":
      return { provider: "anthropic", client: getAnthropicClient(), model: BALANCED_MODEL };
    case "smart":
      return { provider: "anthropic", client: getAnthropicClient(), model: SMART_MODEL };
    case "fallback":
      return { provider: "kimi", client: getKimiClient(), model: FALLBACK_MODEL };
  }
}
