import { z } from "zod";
import {
  CrewKickoffRequest,
  CrewKickoffResponse,
  CrewKickoffResponseSchema,
  CrewStatusResponse,
  CrewStatusResponseSchema,
  RunSummaryListSchema,
  RunStepSchema,
  DecisionSchema,
  type RunSummary,
  type RunStep,
  type Decision,
  type DecisionAction,
} from "./types";
import {
  authedFetch,
  ENGINE_TOKEN,
  EngineError,
  handleResponse,
  logWarning,
  withOwnerId,
} from "./_internal";

// Guard boot-time — utilise logWarning (SSR-safe, pas de console.warn nu).
if (!ENGINE_TOKEN) {
  logWarning(
    "[crewai/client] CREWAI_ENGINE_AUTH_TOKEN missing — calls will fail with 401",
  );
}

/**
 * Erreur typée renvoyée par les appels HTTP vers l'engine CrewAI Python.
 *
 * Porte `status` (code HTTP réel renvoyé par l'engine) et `path` (route appelée),
 * ce qui permet aux call-sites de mapper proprement (401 → 401, 404 → 404,
 * 429 → 429, autre → 502) sans recourir à un string-match fragile sur `message`.
 *
 * Alias rétrocompatible de `EngineError` (_internal.ts).
 */
export class CrewaiEngineError extends EngineError {
  constructor(status: number, path: string, message: string) {
    super(status, path, message);
    this.name = "CrewaiEngineError";
  }
}

/**
 * Options communes passées à toutes les méthodes du `crewaiClient`.
 *
 * - `ownerId` : ajoute `?owner_id=...` au path engine (multi-tenant V2). `null`/
 *   `undefined` = pas de filtre (V1 single-user).
 * - `timeoutMs` : override le timeout par défaut (`DEFAULT_TIMEOUT_MS`).
 *
 * @internal — non exportée : aucun call-site externe ne l'importe.
 */
interface CrewaiCallOptions {
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
    const data = await handleResponse<unknown>(res, path, "[crewai/client]");
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
    const data = await handleResponse<unknown>(res, path, "[crewai/client]");
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
    const data = await handleResponse<unknown>(res, path, "[crewai/client]");
    return RunSummaryListSchema.parse(data);
  },

  /**
   * Liste les steps d'un run, filtrés par owner_id.
   * Endpoint engine : GET /v1/crews/{crew}/runs/{runId}/steps?owner_id=...
   */
  async listSteps(
    crewName: string,
    kickoffId: string,
    opts: CrewaiCallOptions = {},
  ): Promise<RunStep[]> {
    const path = withOwnerId(
      `/v1/crews/${encodeURIComponent(crewName)}/runs/${encodeURIComponent(kickoffId)}/steps`,
      opts.ownerId,
    );
    const res = await authedFetch(path, { method: "GET" }, opts.timeoutMs);
    const data = await handleResponse<unknown>(res, path, "[crewai/client]");
    return z.array(RunStepSchema).parse(data);
  },

  /**
   * Enregistre une décision pour un crew, scopée par owner_id.
   * Endpoint engine : POST /v1/crews/{crew}/decisions?owner_id=...
   */
  async recordDecision(
    crewName: string,
    payload: { kickoff_id: string; action: DecisionAction; snooze_hours?: number },
    opts: CrewaiCallOptions = {},
  ): Promise<Decision> {
    const path = withOwnerId(
      `/v1/crews/${encodeURIComponent(crewName)}/decisions`,
      opts.ownerId,
    );
    const res = await authedFetch(
      path,
      { method: "POST", body: JSON.stringify(payload) },
      opts.timeoutMs,
    );
    const data = await handleResponse<unknown>(res, path, "[crewai/client]");
    return DecisionSchema.parse(data);
  },

  /**
   * Liste les décisions enregistrées pour un run, filtrées par owner_id.
   * Endpoint engine : GET /v1/crews/{crew}/runs/{runId}/decisions?owner_id=...
   */
  async listDecisions(
    crewName: string,
    kickoffId: string,
    opts: CrewaiCallOptions = {},
  ): Promise<Decision[]> {
    try {
      const path = withOwnerId(
        `/v1/crews/${encodeURIComponent(crewName)}/runs/${encodeURIComponent(kickoffId)}/decisions`,
        opts.ownerId,
      );
      const res = await authedFetch(path, { method: "GET" }, opts.timeoutMs);
      if (!res.ok) return [];
      const data = await handleResponse<unknown>(res, path, "[crewai/client]");
      return z.array(DecisionSchema).parse(data);
    } catch {
      return [];
    }
  },
};
