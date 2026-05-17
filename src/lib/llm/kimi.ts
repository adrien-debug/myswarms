import OpenAI from "openai";

if (!process.env.HYPERCLI_API_KEY || !process.env.HYPERCLI_BASE_URL) {
  throw new Error("HYPERCLI_API_KEY or HYPERCLI_BASE_URL missing");
}

export const kimi = new OpenAI({
  apiKey: process.env.HYPERCLI_API_KEY,
  baseURL: process.env.HYPERCLI_BASE_URL,
});

export const KIMI_DEFAULT_MODEL = process.env.HYPERCLI_DEFAULT_MODEL ?? "kimi-k2.6";
