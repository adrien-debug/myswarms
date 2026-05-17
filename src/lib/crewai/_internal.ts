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
