import { z } from "zod";

import { UUID_REGEX } from "@/lib/utils/uuid";

// G2/J1 fix : Zod 4 `z.string().uuid(...)` valide UNIQUEMENT les UUID v4
// stricts. L'engine Python (uuid.uuid4 / uuid.uuid1 / uuid7 / customs) accepte
// tout UUID au format canonique. On réutilise `UUID_REGEX` (source de vérité
// unique dans `@/lib/utils/uuid`) — regex "format only" qui matche n'importe
// quelle version (v1..v8). Cela garde le contrat Zod input ALIGNÉ avec les
// guards des routes BFF (un swarm visible reste ouvrable).
const uuidString = (message = "Format UUID invalide") =>
  z.string().regex(UUID_REGEX, message);

// ─── Enums alignés sur le schéma DB ──────────────────────────────────────────

export const AgentRoleSchema = z.enum([
  "coordinator",
  "analyst",
  "executor",
  "reviewer",
  "tool_runner",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

// C8 fix : "hypercli" est accepté côté engine — l'ajouter ici pour ne plus
// rejeter les configs valides. On garde "kimi" pour la backward compat des
// swarms existants en DB (alias historique de "hypercli").
export const ModelProviderSchema = z.enum([
  "anthropic",
  "openai",
  "kimi",
  "hypercli",
]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ToolCategorySchema = z.enum([
  "api_call",
  "file_io",
  "code_execution",
  "search",
  "database",
  "custom",
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export const SwarmTriggerSchema = z.enum([
  "morning",
  "evening",
  "intraday",
  "on_demand",
  "webhook",
]);
export type SwarmTrigger = z.infer<typeof SwarmTriggerSchema>;

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "paused_hitl",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

// ─── Defaults via env (pas de magic numbers) ────────────────────────────────

const DEFAULT_TEMP = Number(process.env.NEXT_PUBLIC_SWARMS_DEFAULT_TEMPERATURE ?? "0.7");
const DEFAULT_MAX_TOKENS = Number(process.env.NEXT_PUBLIC_SWARMS_DEFAULT_MAX_TOKENS ?? "4096");
const MIN_NAME_LENGTH = Number(process.env.NEXT_PUBLIC_SWARMS_MIN_NAME_LENGTH ?? "2");
const MAX_NAME_LENGTH = Number(process.env.NEXT_PUBLIC_SWARMS_MAX_NAME_LENGTH ?? "120");

// ─── Sous-schémas (input forms) ─────────────────────────────────────────────

export const AgentInputSchema = z.object({
  id: uuidString().optional(),
  name: z
    .string()
    .min(MIN_NAME_LENGTH, "Nom trop court")
    .max(MAX_NAME_LENGTH, "Nom trop long"),
  role: AgentRoleSchema,
  system_prompt: z.string().min(1, "Prompt requis").max(8000),
  model_provider: ModelProviderSchema,
  model_name: z.string().min(1, "Modèle requis").max(120),
  temperature: z.number().min(0).max(2).default(DEFAULT_TEMP),
  max_tokens: z.number().int().positive().max(200_000).default(DEFAULT_MAX_TOKENS),
  parent_agent_id: uuidString().nullable().optional(),
  position_x: z.number().int().default(0),
  position_y: z.number().int().default(0),
});
// Type côté form (input) — tous les `.default()` apparaissent comme optionnels.
export type AgentInput = z.output<typeof AgentInputSchema>;

export const TaskInputSchema = z.object({
  id: uuidString().optional(),
  // C4 fix : agent_id required — chaque tâche doit avoir un owner explicite,
  // sinon le moteur tombe en silence sur le "auto" (sélection arbitraire du
  // premier agent disponible). Le UI bloque désormais la création si aucun
  // agent n'est encore défini.
  //
  // H1 fix : ce schema est utilisé SEULEMENT en INPUT (form save). Pour la
  // lecture (GET swarm), utiliser `TaskRecordSchema` qui tolère un
  // `agent_id=null` (cas réel après cascade SET NULL en DB).
  agent_id: uuidString("Agent requis (UUID valide)"),
  name: z
    .string()
    .min(MIN_NAME_LENGTH, "Nom trop court")
    .max(MAX_NAME_LENGTH, "Nom trop long"),
  description: z.string().min(1, "Description requise").max(8000),
  expected_output: z.string().min(1, "Sortie attendue requise").max(8000),
  depends_on_task_id: uuidString().nullable().optional(),
  position_x: z.number().int().default(0),
  position_y: z.number().int().default(0),
});
export type TaskInput = z.output<typeof TaskInputSchema>;

// H1 fix : schema de LECTURE (response engine) — tolérant aux orphelins.
// Après une cascade SET NULL (suppression d'un agent référencé par une task),
// la DB peut renvoyer `agent_id=null` et le builder doit pouvoir afficher
// "Aucun agent — re-pair requis" sans crash de parse.
export const TaskRecordSchema = TaskInputSchema.extend({
  agent_id: uuidString().nullable(),
});
export type TaskRecord = z.output<typeof TaskRecordSchema>;

export const ToolBindingInputSchema = z.object({
  id: uuidString().optional(),
  // F5 fix : agent_id required (option a — cohérence stricte avec tasks).
  // Un binding orphelin (sans agent) n'a aucun sens fonctionnel : impossible
  // pour le moteur de savoir quel agent doit recevoir ce tool. Le UI
  // (ToolPicker) bloque désormais l'ajout si aucun agent n'est sélectionné.
  //
  // H1 fix : schema d'INPUT — pour la lecture, voir `ToolBindingRecordSchema`.
  agent_id: uuidString("Agent requis (UUID valide)"),
  tool_id: uuidString(),
  priority: z.number().int().min(0).max(100).default(0),
  config_json: z.record(z.string(), z.unknown()).default({}),
});
export type ToolBindingInput = z.output<typeof ToolBindingInputSchema>;

// H1 fix : schema de LECTURE pour tool_bindings — agent_id nullable (cascade
// SET NULL en DB lors de la suppression d'un agent).
export const ToolBindingRecordSchema = ToolBindingInputSchema.extend({
  agent_id: uuidString().nullable(),
});
export type ToolBindingRecord = z.output<typeof ToolBindingRecordSchema>;

export const SwarmInputSchema = z.object({
  id: uuidString().optional(),
  name: z
    .string()
    .min(MIN_NAME_LENGTH, "Nom trop court")
    .max(MAX_NAME_LENGTH, "Nom trop long"),
  description: z.string().max(4000).default(""),
  version: z.number().int().positive().default(1),
  config_json: z.record(z.string(), z.unknown()).default({}),
  is_active: z.boolean().default(true),
  is_template: z.boolean().default(false),
  agents: z.array(AgentInputSchema).default([]),
  tasks: z.array(TaskInputSchema).default([]),
  tool_bindings: z.array(ToolBindingInputSchema).default([]),
});
// SwarmInput = output Zod (avec défauts appliqués). On garde un alias pour le
// formulaire d'entrée afin que les déclarations `useForm<SwarmInput>` puissent
// utiliser le même type que les autres composants.
export type SwarmInput = z.output<typeof SwarmInputSchema>;
// Forme strictement attendue à l'entrée du resolver (default fields optionnels).
export type SwarmInputRaw = z.input<typeof SwarmInputSchema>;

// ─── PATCH (partial update) ────────────────────────────────────────────────
//
// F2 fix : un schema dédié aux PATCH partiels — AUCUN `.default()`, et un
// transform final qui strip les clés `undefined` pour que `JSON.stringify`
// ne les sérialise pas. Cela garantit que l'engine reçoit uniquement les
// clés effectivement envoyées, et déclenche `replace_*` UNIQUEMENT pour
// les collections présentes dans le payload.
//
// ⚠️ NE PAS faire `SwarmInputSchema.partial()` ici — `.partial()` ne
// supprime PAS les `.default()`, donc le parse appliquerait
// `agents: []` même si le client n'a envoyé que `description`.
export const SwarmPatchSchema = z
  .object({
    name: z
      .string()
      .min(MIN_NAME_LENGTH, "Nom trop court")
      .max(MAX_NAME_LENGTH, "Nom trop long")
      .optional(),
    description: z.string().max(4000).nullable().optional(),
    version: z.number().int().positive().optional(),
    config_json: z.record(z.string(), z.unknown()).optional(),
    is_active: z.boolean().optional(),
    is_template: z.boolean().optional(),
    agents: z.array(AgentInputSchema).optional(),
    tasks: z.array(TaskInputSchema).optional(),
    tool_bindings: z.array(ToolBindingInputSchema).optional(),
  })
  .transform((data) =>
    Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    ),
  );
export type SwarmPatch = z.output<typeof SwarmPatchSchema>;

// ─── Tool catalog (lecture seule pour le ToolPicker) ────────────────────────

export const ToolSchema = z.object({
  id: uuidString(),
  owner_id: uuidString().nullable().optional(),
  name: z.string(),
  category: ToolCategorySchema,
  description: z.string().nullable().optional(),
  endpoint_url: z.string().nullable().optional(),
  auth_type: z.string().nullable().optional(),
  schema_json: z.record(z.string(), z.unknown()).nullable().optional(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Tool = z.infer<typeof ToolSchema>;

// ─── Réponse engine (swarm complet hydraté) ─────────────────────────────────

export const SwarmRecordSchema = z.object({
  id: uuidString(),
  owner_id: uuidString().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  version: z.number().int(),
  config_json: z.record(z.string(), z.unknown()).default({}),
  is_active: z.boolean(),
  is_template: z.boolean(),
  // C11 défense en profondeur : si l'engine renvoie un fallback sans timestamps
  // (ex: erreur silencieuse côté Python), on évite un crash hard côté front.
  created_at: z.string().nullable().default(""),
  updated_at: z.string().nullable().default(""),
  agents: z.array(AgentInputSchema).default([]),
  // H1 fix : `tasks` et `tool_bindings` utilisent les *RecordSchema pour
  // tolérer agent_id=null (cas réel après cascade SET NULL en DB). Sans cette
  // tolérance, l'UI crashait au parse avec "Chargement échoué" sur un swarm
  // valide mais ayant subi une suppression d'agent.
  tasks: z.array(TaskRecordSchema).default([]),
  tool_bindings: z.array(ToolBindingRecordSchema).default([]),
});
export type SwarmRecord = z.infer<typeof SwarmRecordSchema>;

export const SwarmListItemSchema = z.object({
  id: uuidString(),
  name: z.string(),
  description: z.string().nullable().optional(),
  version: z.number().int(),
  is_active: z.boolean(),
  is_template: z.boolean(),
  agents_count: z.number().int().default(0),
  last_run_at: z.string().nullable().optional(),
  last_run_status: z.string().nullable().optional(),
  // C11 défense en profondeur : timestamps nullable pour matcher un éventuel
  // fallback engine (ex: row partielle après crash).
  updated_at: z.string().nullable().default(""),
});
export type SwarmListItem = z.infer<typeof SwarmListItemSchema>;

// ─── Run / Step ─────────────────────────────────────────────────────────────

export const SwarmKickoffRequestSchema = z.object({
  trigger: SwarmTriggerSchema,
  inputs: z.record(z.string(), z.unknown()).optional(),
});
export type SwarmKickoffRequest = z.infer<typeof SwarmKickoffRequestSchema>;

export const SwarmKickoffResponseSchema = z.object({
  run_id: uuidString(),
});
export type SwarmKickoffResponse = z.infer<typeof SwarmKickoffResponseSchema>;

export const SwarmRunStepSchema = z.object({
  id: uuidString(),
  run_id: uuidString(),
  agent_id: uuidString().nullable().optional(),
  task_id: uuidString().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  task_name: z.string().nullable().optional(),
  step_number: z.number().int(),
  input_text: z.string().nullable().optional(),
  output_text: z.string().nullable().optional(),
  tokens_in: z.number().int().default(0),
  tokens_out: z.number().int().default(0),
  cost_usd: z.number().default(0),
  latency_ms: z.number().nullable().optional(),
  status: z.string(),
  error_text: z.string().nullable().optional(),
  langfuse_span_id: z.string().nullable().optional(),
  created_at: z.string(),
  finished_at: z.string().nullable().optional(),
});
export type SwarmRunStep = z.infer<typeof SwarmRunStepSchema>;

export const SwarmRunSchema = z.object({
  id: uuidString(),
  swarm_id: uuidString(),
  trigger: z.string(),
  status: RunStatusSchema,
  inputs_json: z.record(z.string(), z.unknown()).default({}),
  result_text: z.string().nullable().optional(),
  started_at: z.string(),
  finished_at: z.string().nullable().optional(),
  error_text: z.string().nullable().optional(),
  total_tokens_in: z.number().int().default(0),
  total_tokens_out: z.number().int().default(0),
  total_cost_usd: z.number().default(0),
  langfuse_trace_id: z.string().nullable().optional(),
  created_at: z.string(),
  steps: z.array(SwarmRunStepSchema).default([]),
});
export type SwarmRun = z.infer<typeof SwarmRunSchema>;

export const SwarmRunSummarySchema = z.object({
  id: uuidString(),
  swarm_id: uuidString(),
  trigger: z.string(),
  status: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable().optional(),
  total_tokens_in: z.number().int().default(0),
  total_tokens_out: z.number().int().default(0),
  total_cost_usd: z.number().default(0),
});
export type SwarmRunSummary = z.infer<typeof SwarmRunSummarySchema>;

export const SwarmRunSummaryListSchema = z.array(SwarmRunSummarySchema);
export const SwarmListSchema = z.array(SwarmListItemSchema);
export const ToolListSchema = z.array(ToolSchema);

// ─── Architect Agent (génération de spec via langage naturel) ───────────────
//
// D2 : le builder propose "Générer avec l'IA" → l'utilisateur décrit son swarm
// en langage naturel, l'Architect Agent (engine Python) renvoie une spec de la
// shape `SwarmInputRaw`. On valide la *réponse* avec un schema tolérant dérivé
// de `SwarmInputSchema` (les défauts Zod hydratent les champs manquants), pour
// pouvoir injecter directement dans le state du builder (éditable, pas de
// création auto).

const ARCHITECT_PROMPT_MIN = Number(
  process.env.NEXT_PUBLIC_ARCHITECT_PROMPT_MIN ?? "10",
);
const ARCHITECT_PROMPT_MAX = Number(
  process.env.NEXT_PUBLIC_ARCHITECT_PROMPT_MAX ?? "4000",
);

export const ArchitectGenerateRequestSchema = z.object({
  prompt: z
    .string()
    .min(ARCHITECT_PROMPT_MIN, "Décris ton swarm plus en détail (10 caractères min)")
    .max(ARCHITECT_PROMPT_MAX, "Description trop longue (4000 caractères max)"),
});
export type ArchitectGenerateRequest = z.input<
  typeof ArchitectGenerateRequestSchema
>;

// Spec renvoyée par l'Architect : même shape que `SwarmInputSchema` (les
// `.default()` Zod comblent les champs absents → state builder cohérent).
export const SwarmSpecResponseSchema = SwarmInputSchema;
export type SwarmSpecResponse = z.output<typeof SwarmSpecResponseSchema>;

export const ArchitectResponseSchema = z.object({
  spec: SwarmSpecResponseSchema,
  rationale: z.string().optional().default(""),
  warnings: z.array(z.string()).optional().default([]),
});
export type ArchitectResponse = z.output<typeof ArchitectResponseSchema>;
