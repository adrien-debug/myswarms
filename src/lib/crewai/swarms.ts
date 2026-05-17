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
import { withOwnerId } from "./_internal";

// ─── Config (env, pas de magic numbers) ──────────────────────────────────────

const ENGINE_URL = process.env.CREWAI_ENGINE_URL ?? "http://localhost:8000";
const ENGINE_TOKEN = process.env.CREWAI_ENGINE_AUTH_TOKEN ?? "";
const DEFAULT_TIMEOUT_MS = Number(process.env.CREWAI_ENGINE_TIMEOUT_MS ?? "30000");

/**
 * Timeout dédié à l'Architect Agent : la génération de spec passe par un run
 * LLM (rédaction des agents/tasks/tool_bindings) — significativement plus lent
 * qu'un CRUD swarm. Valeur généreuse (par défaut 90s) configurable via env.
 */
export const ARCHITECT_TIMEOUT_MS = Number(
  process.env.CREWAI_ENGINE_ARCHITECT_TIMEOUT_MS ?? "90000",
);

/**
 * H8 fix : log centralisé pour les warnings SSR boot-time.
 *
 * V1 : appelle `console.warn` (visible dans les logs Vercel server-side).
 * V2 : remplacer par un client de logging structuré (e.g. pino, Sentry,
 * Better Stack) — un seul point de modification ici.
 *
 * Important : aucun side-effect côté client (test `typeof window === "undefined"`
 * inclus) pour éviter de polluer la console navigateur.
 */
function logWarning(message: string): void {
  if (typeof window !== "undefined") return;
  console.warn(message);
}

/**
 * Limite de troncature du body brut dans les messages d'erreur. Évite de leak
 * une stack trace Python complète en clair vers les clients HTTP.
 */
const ERROR_BODY_MAX_CHARS = 200;

if (!ENGINE_TOKEN) {
  logWarning(
    "[crewai/swarms] CREWAI_ENGINE_AUTH_TOKEN missing — calls will fail with 401",
  );
}

/**
 * Erreur typée renvoyée par les appels HTTP vers l'engine CrewAI Python
 * (surface `swarms`).
 *
 * Porte `status` (code HTTP réel renvoyé par l'engine) et `path` (route appelée),
 * ce qui permet aux call-sites de mapper proprement (401 → 401, 404 → 404,
 * 429 → 429, autre → 502) sans recourir à un string-match fragile sur `message`.
 *
 * Note : modèle identique à `CrewaiEngineError` (src/lib/crewai/client.ts).
 * Volontairement 2 classes distinctes (pas de base commune) pour ne pas
 * impacter les call-sites existants de `CrewaiEngineError` — la sécurité prime
 * sur le DRY ici.
 */
export class SwarmEngineError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "SwarmEngineError";
    this.status = status;
    this.path = path;
  }
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  return fetch(`${ENGINE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${ENGINE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "(no body)");
    const truncated =
      rawBody.length > ERROR_BODY_MAX_CHARS
        ? `${rawBody.slice(0, ERROR_BODY_MAX_CHARS)}…`
        : rawBody;
    throw new SwarmEngineError(
      res.status,
      path,
      `[crewai/swarms] ${res.status} ${res.statusText} on ${path}: ${truncated}`,
    );
  }
  // 204 No Content → renvoyer null
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

// ─── Public client ──────────────────────────────────────────────────────────

/**
 * Client engine CrewAI.
 *
 * Toutes les méthodes acceptent un `ownerId` optionnel — propagé en
 * query-param `?owner_id=` quand défini. Architecture pensée pour le passage
 * single-user (V1) → multi-tenant (V2 Supabase auth) sans changement de
 * surface côté call-sites.
 */
export const swarmsClient = {
  async list(
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<SwarmListItem[]> {
    const path = withOwnerId(`/v1/swarms`, ownerId);
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
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
    await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
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
    const data = await handleResponse<unknown>(res, path);
    return ArchitectResponseSchema.parse(data);
  },

  async listTools(
    ownerId?: string | null,
    timeoutMs?: number,
  ): Promise<Tool[]> {
    const path = withOwnerId(`/v1/tools`, ownerId);
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path);
    return ToolListSchema.parse(data);
  },
};
