/**
 * _internal.ts — helpers partagés entre client.ts et swarms.ts.
 *
 * NE PAS importer directement depuis le code applicatif : utiliser les exports
 * publics de client.ts ou swarms.ts (surfaces stables).
 */

// ─── Config (env, pas de magic numbers) ──────────────────────────────────────

const ENGINE_URL =
  process.env.CREWAI_ENGINE_URL ?? "http://localhost:8000";
export const ENGINE_TOKEN = process.env.CREWAI_ENGINE_AUTH_TOKEN ?? "";

/**
 * Limite de troncature du body brut dans les messages d'erreur. Évite de leak
 * une stack trace Python complète en clair vers les clients HTTP.
 */
const ERROR_BODY_MAX_CHARS = 200;

// ─── Logging centralisé ───────────────────────────────────────────────────────

/**
 * Log centralisé pour les warnings SSR boot-time.
 *
 * V1 : appelle `console.warn` (visible dans les logs Vercel server-side).
 * V2 : remplacer par un client de logging structuré (e.g. pino, Sentry,
 * Better Stack) — un seul point de modification ici.
 *
 * Important : aucun side-effect côté client (test `typeof window === "undefined"`
 * inclus) pour éviter de polluer la console navigateur.
 */
export function logWarning(message: string): void {
  if (typeof window !== "undefined") return;
  console.warn(message);
}

// ─── Classe d'erreur unifiée ──────────────────────────────────────────────────

/**
 * Erreur typée renvoyée par les appels HTTP vers l'engine CrewAI Python.
 *
 * Porte `status` (code HTTP réel renvoyé par l'engine) et `path` (route appelée),
 * ce qui permet aux call-sites de mapper proprement (401 → 401, 404 → 404,
 * 429 → 429, autre → 502) sans recourir à un string-match fragile sur `message`.
 *
 * `CrewaiEngineError` et `SwarmEngineError` sont des alias réexportés depuis
 * leurs modules d'origine (client.ts / swarms.ts) pour la rétrocompatibilité.
 */
export class EngineError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "EngineError";
    this.status = status;
    this.path = path;
  }
}

// ─── Retry (Railway cold starts) ─────────────────────────────────────────────

/** Codes HTTP qui déclenchent un retry (ex : Railway cold start, gateway down). */
const RETRY_STATUSES = new Set([502, 503, 504]);

/** Backoff exponentiel en ms : [500, 1500, 4500, …]. 3 tentatives max. */
const RETRY_BACKOFF_MS = [500, 1500, 4500];

// ─── authedFetch (unique, avec retry) ────────────────────────────────────────

/**
 * Fetch authentifié vers l'engine CrewAI avec retry exponentiel sur 502/503/504.
 *
 * Note : `cache: "no-store"` forcé pour toutes les routes (SSR Next.js).
 */
export async function authedFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const timeout =
    timeoutMs ?? Number(process.env.CREWAI_ENGINE_TIMEOUT_MS ?? "30000");

  const doFetch = () =>
    fetch(`${ENGINE_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeout),
      headers: {
        Authorization: `Bearer ${ENGINE_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

  let lastRes: Response | undefined;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const res = await doFetch();
      if (!RETRY_STATUSES.has(res.status) || attempt === RETRY_BACKOFF_MS.length) {
        return res;
      }
      // Retry path — on attend avant la prochaine tentative.
      lastRes = res;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, RETRY_BACKOFF_MS[attempt]),
      );
    } catch (err) {
      // Timeout ou erreur réseau — ne pas retenter (AbortError = timeout willful).
      throw err;
    }
  }
  // Tous les retries épuisés — renvoyer la dernière réponse reçue.
  return lastRes!;
}

// ─── handleResponse ───────────────────────────────────────────────────────────

/**
 * Décode la réponse HTTP et lance `EngineError` si non-ok.
 * Le `prefix` permet de distinguer les messages d'erreur entre client et swarms.
 *
 * Note : ne gère plus le 204 No Content — utiliser `handleResponseVoid` pour
 * les endpoints DELETE/204.
 */
export async function handleResponse(
  res: Response,
  path: string,
  prefix = "[crewai/engine]",
): Promise<unknown> {
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "(no body)");
    const truncated =
      rawBody.length > ERROR_BODY_MAX_CHARS
        ? `${rawBody.slice(0, ERROR_BODY_MAX_CHARS)}…`
        : rawBody;
    throw new EngineError(
      res.status,
      path,
      `${prefix} ${res.status} ${res.statusText} on ${path}: ${truncated}`,
    );
  }
  if (res.status === 204) {
    throw new EngineError(
      204,
      path,
      `${prefix} unexpected 204 No Content on ${path}`,
    );
  }
  return await res.json();
}

/**
 * Variante pour les endpoints qui renvoient 204 No Content (ex: DELETE).
 * Throw `EngineError` si !res.ok, sinon retourne void.
 */
export async function handleResponseVoid(
  res: Response,
  path: string,
  prefix = "[crewai/engine]",
): Promise<void> {
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "(no body)");
    const truncated =
      rawBody.length > ERROR_BODY_MAX_CHARS
        ? `${rawBody.slice(0, ERROR_BODY_MAX_CHARS)}…`
        : rawBody;
    throw new EngineError(
      res.status,
      path,
      `${prefix} ${res.status} ${res.statusText} on ${path}: ${truncated}`,
    );
  }
}

// ─── withOwnerId ──────────────────────────────────────────────────────────────

/**
 * Append `owner_id=...` query param to an engine path.
 *
 * No-op if `ownerId` is `null` or `undefined` (V1 single-user stub via
 * `getOwnerId()`). Handles existing query params correctly: uses `&` if the
 * path already contains `?`, else `?`.
 */
export function withOwnerId(
  path: string,
  ownerId: string | null | undefined,
): string {
  if (!ownerId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}owner_id=${encodeURIComponent(ownerId)}`;
}
