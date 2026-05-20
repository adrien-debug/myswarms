/**
 * Canonical UUID format regex (format-only, version-agnostic).
 *
 * Matches `8-4-4-4-12` hex chars WITHOUT constraining the version nibble or
 * the variant nibble — i.e. accepts v1..v8 (uuid4 from Postgres
 * `gen_random_uuid()` / Python `uuid.uuid4()`, but also historical uuid1 /
 * uuid7 / custom UUIDs the engine may have generated).
 *
 * G2/J1 reconciliation : this is the SINGLE source of truth for "looks like a
 * UUID". `src/lib/forms/swarmSchemas.ts` imports this constant so the Zod
 * input contract and the BFF route guards stay aligned — a swarm visible in
 * `/api/swarms` is always openable in the detail / kickoff / status routes.
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Backward-compat export — still imported (live, not dead) by legacy
 * Chief-of-Staff routes under `src/app/{api/,}crews/**` which are out of scope
 * for this fix. Semantics are now identical to {@link isValidUuid}
 * (format-only); the historical "V4" naming is kept only for those call sites.
 */
export const isValidUuidV4 = isValidUuid;
