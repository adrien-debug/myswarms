/**
 * OpenAI client — usage: embeddings only (text-embedding-3-small, 1536d).
 * Ne pas utiliser pour du chat sauf fallback ultime.
 */
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY missing");
}

export const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
