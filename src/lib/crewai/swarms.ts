import {
  ArchitectResponse,
  ArchitectResponseSchema,
  SwarmInput,
  SwarmInputSchema,
  SwarmKickoffRequest,
  SwarmKickoffRequestSchema,
  SwarmKickoffResponse,
  SwarmKickoffResponseSchema,
  SwarmListItem,
  SwarmListSchema,
  SwarmPatch,
  SwarmRecord,
  SwarmRecordSchema,
  SwarmRun,
  SwarmRunSchema,
  SwarmRunSummary,
  SwarmRunSummaryListSchema,
  Tool,
  ToolListSchema,
} from "@/lib/forms/swarmSchemas";
import {
  authedFetch,
  ENGINE_TOKEN,
  EngineError,
  handleResponse,
  logWarning,
  withOwnerId,
} from "./_internal";

// ─── Config (env, pas de magic numbers) ──────────────────────────────────────

/**
 * Timeout dédié à l'Architect Agent : la génération de spec passe par un run
 * LLM (rédaction des agents/tasks/tool_bindings) — significativement plus lent
 * qu'un CRUD swarm. Valeur généreuse (par défaut 90s) configurable via env.
 */
const ARCHITECT_TIMEOUT_MS = Number(
  process.env.CREWAI_ENGINE_ARCHITECT_TIMEOUT_MS ?? "90000",
);

// Guard boot-time — utilise logWarning (SSR-safe, pas de console.warn nu).
if (!ENGINE_TOKEN) {
  logWarning(
    "[crewai/swarms] CREWAI_ENGINE_AUTH_TOKEN missing — calls will fail with 401",
  );
}

/**
 * Erreur typée renvoyée par les appels HTTP vers l'engine CrewAI Python
 * (surface `swarms`).
 *
 * Alias rétrocompatible de `EngineError` (_internal.ts). Les call-sites et les
 * tests qui importent `SwarmEngineError` depuis ce module continuent de
 * fonctionner sans modification.
 */
export class SwarmEngineError extends EngineError {
  constructor(status: number, path: string, message: string) {
    super(status, path, message);
    this.name = "SwarmEngineError";
  }
}

// ─── Public client ──────────────────────────────────────────────────────────

/**
 * Client engine CrewAI.
 *
 * Toutes les méthodes acceptent un `ownerId` optionnel — propagé en
 * query-param `?owner_id=` quand défini. Architecture pensée pour le passage
 * single-user (V1) → multi-tenant (V2 Supabase auth) sans changement de
 * surface côté call-sites.
 *
 * Note : authedFetch inclut un retry exponentiel sur 502/503/504 (Railway cold
 * starts) — tous les appels en bénéficient automatiquement.
 */
export const swarmsClient = {
  async list(
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmListItem[]> {
    const path = withOwnerId(`/v1/swarms`, ownerId);
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmListSchema.parse(data);
  },

  async get(
    swarmId: string,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmRecord> {
    const path = withOwnerId(
      `/v1/swarms/${encodeURIComponent(swarmId)}`,
      ownerId,
    );
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmRecordSchema.parse(data);
  },

  async create(
    payload: SwarmInput,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmRecord> {
    const validated = SwarmInputSchema.parse(payload);
    const path = withOwnerId(`/v1/swarms`, ownerId);
    const res = await authedFetch(
      path,
      { method: "POST", body: JSON.stringify(validated) },
      timeoutMs,
    );
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmRecordSchema.parse(data);
  },

  async update(
    swarmId: string,
    payload: SwarmPatch | Partial<SwarmInput>,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmRecord> {
    const path = withOwnerId(
      `/v1/swarms/${encodeURIComponent(swarmId)}`,
      ownerId,
    );
    // F2 fix : `JSON.stringify` drop déjà les `undefined`, mais on s'assure
    // qu'aucune clé "fantôme" non envoyée par le client ne se glisse côté
    // engine. Le BFF passe déjà du `SwarmPatch` clean (transform Zod).
    const res = await authedFetch(
      path,
      { method: "PATCH", body: JSON.stringify(payload) },
      timeoutMs,
    );
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmRecordSchema.parse(data);
  },

  async delete(
    swarmId: string,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<void> {
    const path = withOwnerId(
      `/v1/swarms/${encodeURIComponent(swarmId)}`,
      ownerId,
    );
    const res = await authedFetch(path, { method: "DELETE" }, timeoutMs);
    await handleResponse<unknown>(res, path, "[crewai/swarms]");
  },

  async kickoff(
    swarmId: string,
    request: SwarmKickoffRequest,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmKickoffResponse> {
    const validated = SwarmKickoffRequestSchema.parse(request);
    const path = withOwnerId(
      `/v1/swarms/${encodeURIComponent(swarmId)}/kickoff`,
      ownerId,
    );
    const res = await authedFetch(
      path,
      { method: "POST", body: JSON.stringify(validated) },
      timeoutMs,
    );
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmKickoffResponseSchema.parse(data);
  },

  async status(
    swarmId: string,
    runId: string,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmRun> {
    const path = withOwnerId(
      `/v1/swarms/${encodeURIComponent(swarmId)}/status/${encodeURIComponent(runId)}`,
      ownerId,
    );
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmRunSchema.parse(data);
  },

  async getRun(
    runId: string,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmRun> {
    const path = withOwnerId(
      `/v1/runs/${encodeURIComponent(runId)}`,
      ownerId,
    );
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmRunSchema.parse(data);
  },

  async listRuns(
    swarmId: string,
    limit: number = 20,
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmRunSummary[]> {
    const path = withOwnerId(
      `/v1/swarms/${encodeURIComponent(swarmId)}/runs?limit=${limit}`,
      ownerId,
    );
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return SwarmRunSummaryListSchema.parse(data);
  },

  /**
   * Architect Agent — génère une spec de swarm à partir d'une description en
   * langage naturel. Run LLM côté engine → timeout généreux par défaut
   * (`ARCHITECT_TIMEOUT_MS`). La spec renvoyée est de la shape `SwarmInputRaw`
   * (alimente directement le builder, éditable avant création).
   */
  async architectGenerate(
    prompt: string,
    ownerId?: string | null,
    timeoutMs: number = ARCHITECT_TIMEOUT_MS,
  ): Promise<ArchitectResponse> {
    const path = withOwnerId(`/v1/swarms/architect/generate`, ownerId);
    const res = await authedFetch(
      path,
      { method: "POST", body: JSON.stringify({ prompt }) },
      timeoutMs,
    );
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return ArchitectResponseSchema.parse(data);
  },

  async listTools(
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<Tool[]> {
    const path = withOwnerId(`/v1/tools`, ownerId);
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path, "[crewai/swarms]");
    return ToolListSchema.parse(data);
  },
};
