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
  result: z.string().optional(),
  started_at: z.string(), // ISO 8601
  finished_at: z.string().optional(), // ISO 8601
  state: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

// ─── TypeScript types (inferred from zod) ────────────────────────────────────

export type CrewKickoffRequest = z.infer<typeof CrewKickoffRequestSchema>;
export type CrewKickoffResponse = z.infer<typeof CrewKickoffResponseSchema>;
export type CrewStatusResponse = z.infer<typeof CrewStatusResponseSchema>;
