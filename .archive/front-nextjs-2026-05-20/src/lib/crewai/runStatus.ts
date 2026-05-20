/** Statuts non-terminaux : le run progresse encore (polling pertinent). */
export const RUNNING_STATUSES = ["running", "pending", "paused_hitl"] as const;

export function isRunningStatus(status: string | null | undefined): boolean {
  return status != null && (RUNNING_STATUSES as readonly string[]).includes(status);
}
