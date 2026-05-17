/**
 * Format ISO 8601 date string to localized fr-FR display.
 * Falls back to the raw ISO if parsing/formatting fails (Vercel runtime, missing ICU).
 *
 * @param iso ISO 8601 timestamp
 * @param options.withSeconds include HH:MM:SS instead of HH:MM
 * @param options.withYear include year (defaults to true for detail views, false for list)
 */
export function formatDate(
  iso: string,
  options: { withSeconds?: boolean; withYear?: boolean } = {},
): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: options.withYear ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
      second: options.withSeconds ? "2-digit" : undefined,
    });
  } catch {
    return iso;
  }
}
