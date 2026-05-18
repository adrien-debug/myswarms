import {
  CrewKickoffRequest,
  CrewKickoffResponse,
  CrewKickoffResponseSchema,
  CrewStatusResponse,
  CrewStatusResponseSchema,
  RunSummaryListSchema,
  type RunSummary,
} from "./types";
import { withOwnerId } from "./_internal";

const ENGINE_URL =
  process.env.CREWAI_ENGINE_URL ?? "http://localhost:8000";
const ENGINE_TOKEN = process.env.CREWAI_ENGINE_AUTH_TOKEN ?? "";

// 30s — kickoff is now async (returns kickoff_id immediately, crew runs in background).
// Both kickoff and status round-trips should complete in <2s. 5 min was only needed
// when kickoff was synchronous and awaited the full ~48s crew flow end-to-end.
// Status polling is handled by the UI (AutoRefresh component, 5s interval).
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Limite de troncature du body brut dans les messages d'erreur. Évite de leak
 * une stack trace Python complète en clair vers les clients HTTP.
 */
const ERROR_BODY_MAX_CHARS = 200;

if (!ENGINE_TOKEN) {
  console.warn(
    "[crewai/client] CREWAI_ENGINE_AUTH_TOKEN missing — calls will fail with 401"
  );
}

/**
 * Erreur typée renvoyée par les appels HTTP vers l'engine CrewAI Python.
 *
 * Porte `status` (code HTTP réel renvoyé par l'engine) et `path` (route appelée),
 * ce qui permet aux call-sites de mapper proprement (401 → 401, 404 → 404,
 * 429 → 429, autre → 502) sans recourir à un string-match fragile sur `message`.
 */
export class CrewaiEngineError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "CrewaiEngineError";
    this.status = status;
    this.path = path;
  }
}

const RETRY_STATUSES = [502, 503];
const RETRY_BACKOFF_MS = [1000, 2000];

async function authedFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  let lastRes: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((r) =>
        setTimeout(r, RETRY_BACKOFF_MS[attempt - 1])
      );
    }
    try {
      const res = await fetch(`${ENGINE_URL}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${ENGINE_TOKEN}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      if (!RETRY_STATUSES.includes(res.status)) return res;
      lastRes = res;
    } catch (err) {
      lastErr = err;
      // network error (ECONNREFUSED, DNS, AbortError) — retry
    }
  }
  // All 3 attempts exhausted
  if (lastRes !== undefined) return lastRes;
  throw lastErr ?? new Error(`Network error after 3 attempts: ${path}`);
}

async function handleResponse<T>(
  res: Response,
  path: string
): Promise<T> {
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "(no body)");
    const truncated =
      rawBody.length > ERROR_BODY_MAX_CHARS
        ? `${rawBody.slice(0, ERROR_BODY_MAX_CHARS)}…`
        : rawBody;
    throw new CrewaiEngineError(
      res.status,
      path,
      `[crewai/client] ${res.status} ${res.statusText} on ${path}: ${truncated}`
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Options communes passées à toutes les méthodes du `crewaiClient`.
 *
 * - `ownerId` : ajoute `?owner_id=...` au path engine (multi-tenant V2). `null`/
 *   `undefined` = pas de filtre (V1 single-user).
 * - `timeoutMs` : override le timeout par défaut (`DEFAULT_TIMEOUT_MS`).
 */
export interface CrewaiCallOptions {
  ownerId?: string | null;
  timeoutMs?: number;
}

export const crewaiClient = {
  async kickoff(
    crewName: string,
    request: CrewKickoffRequest,
    opts: CrewaiCallOptions = {},
  ): Promise<CrewKickoffResponse> {
    const path = withOwnerId(`/v1/crews/${crewName}/kickoff`, opts.ownerId);
    const res = await authedFetch(
      path,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
      opts.timeoutMs,
    );
    const data = await handleResponse<unknown>(res, path);
    return CrewKickoffResponseSchema.parse(data);
  },

  async status(
    crewName: string,
    kickoffId: string,
    opts: CrewaiCallOptions = {},
  ): Promise<CrewStatusResponse> {
    const path = withOwnerId(
      `/v1/crews/${crewName}/status/${kickoffId}`,
      opts.ownerId,
    );
    const res = await authedFetch(path, { method: "GET" }, opts.timeoutMs);
    const data = await handleResponse<unknown>(res, path);
    return CrewStatusResponseSchema.parse(data);
  },

  async listRuns(
    crewName: string,
    limit: number = 20,
    opts: CrewaiCallOptions = {},
  ): Promise<RunSummary[]> {
    const path = withOwnerId(
      `/v1/crews/${encodeURIComponent(crewName)}/runs?limit=${limit}`,
      opts.ownerId,
    );
    const res = await authedFetch(path, { method: "GET" }, opts.timeoutMs);
    const data = await handleResponse<unknown>(res, path);
    return RunSummaryListSchema.parse(data);
  },
};
