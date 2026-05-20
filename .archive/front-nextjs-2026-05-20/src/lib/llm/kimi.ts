import OpenAI from "openai";

const BUILD_TIME = process.env.NEXT_PHASE === "phase-production-build";
const apiKey = process.env.HYPERCLI_API_KEY ?? (BUILD_TIME ? "build-placeholder" : undefined);
if (!apiKey) throw new Error("HYPERCLI_API_KEY manquante");

export const kimi = new OpenAI({
  apiKey,
  baseURL: process.env.HYPERCLI_BASE_URL || "https://api.hypercli.com/v1",
});

export const KIMI_MODEL = process.env.HYPERCLI_DEFAULT_MODEL || "kimi-k2.6";
