import {
  CrewKickoffRequest,
  CrewKickoffResponse,
  CrewKickoffResponseSchema,
  CrewStatusResponse,
  CrewStatusResponseSchema,
} from "./types";

const ENGINE_URL =
  process.env.CREWAI_ENGINE_URL ?? "http://localhost:8000";
const ENGINE_TOKEN = process.env.CREWAI_ENGINE_AUTH_TOKEN ?? "";

const DEFAULT_TIMEOUT_MS = 30_000;

if (!ENGINE_TOKEN) {
  console.warn(
    "[crewai/client] CREWAI_ENGINE_AUTH_TOKEN missing — calls will fail with 401"
  );
}

// TODO V1.1: add exponential backoff retry on 502/503 (Railway cold starts)
async function authedFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  return fetch(`${ENGINE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${ENGINE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function handleResponse<T>(
  res: Response,
  path: string
): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(
      `[crewai/client] ${res.status} ${res.statusText} on ${path}: ${body}`
    );
  }
  return res.json() as Promise<T>;
}

export const crewaiClient = {
  async kickoff(
    crewName: string,
    request: CrewKickoffRequest,
    timeoutMs?: number
  ): Promise<CrewKickoffResponse> {
    const path = `/v1/crews/${crewName}/kickoff`;
    const res = await authedFetch(path, {
      method: "POST",
      body: JSON.stringify(request),
    }, timeoutMs);
    const data = await handleResponse<unknown>(res, path);
    return CrewKickoffResponseSchema.parse(data);
  },

  async status(
    crewName: string,
    kickoffId: string,
    timeoutMs?: number
  ): Promise<CrewStatusResponse> {
    const path = `/v1/crews/${crewName}/status/${kickoffId}`;
    const res = await authedFetch(path, { method: "GET" }, timeoutMs);
    const data = await handleResponse<unknown>(res, path);
    return CrewStatusResponseSchema.parse(data);
  },
};
