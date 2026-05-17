import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────

export type CrewTrigger = "morning" | "evening" | "intraday" | "on_demand" | "webhook";
export type RunStatus =
  | "pending"
  | "running"
  | "paused_hitl"
  | "completed"
  | "failed"
  | "cancelled";

// ─── Zod schemas (runtime validation) ────────────────────────────────────────

export const CrewTriggerSchema = z.enum([
  "morning",
  "evening",
  "intraday",
  "on_demand",
  "webhook",
]);

/**
 * RunStatus enum — superset des valeurs que peut produire le backend Python.
 * Les valeurs `"pending"` et `"paused_hitl"` sont réservées pour V2 (queue + HitL).
 * Le backend V1 produit uniquement : "running", "completed", "failed", "cancelled".
 */
export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "paused_hitl",
  "completed",
  "failed",
  "cancelled",
]);

export const CrewKickoffRequestSchema = z.object({
  trigger: CrewTriggerSchema,
  inputs: z.record(z.string(), z.unknown()).optional(),
});

export const CrewKickoffResponseSchema = z.object({
  kickoff_id: z.string(),
});

export const CrewStatusResponseSchema = z.object({
  kickoff_id: z.string(),
  status: RunStatusSchema,
  // Python Pydantic Optional[X] serializes as JSON null — accept both null and undefined.
  result: z.string().nullable().optional(),
  started_at: z.string(), // ISO 8601
  finished_at: z.string().nullable().optional(), // ISO 8601
  state: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
});

// ─── Run summary (lightweight, for list views) ───────────────────────────────

/**
 * RunSummary — subset of CrewStatusResponse, no state field.
 * Returned by GET /v1/crews/{crew}/runs?limit=N.
 */
export const RunSummarySchema = z.object({
  kickoff_id: z.string(),
  trigger: z.string(),
  status: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunSummaryListSchema = z.array(RunSummarySchema);

// ─── TypeScript types (inferred from zod) ────────────────────────────────────

export type CrewKickoffRequest = z.infer<typeof CrewKickoffRequestSchema>;
export type CrewKickoffResponse = z.infer<typeof CrewKickoffResponseSchema>;
export type CrewStatusResponse = z.infer<typeof CrewStatusResponseSchema>;
