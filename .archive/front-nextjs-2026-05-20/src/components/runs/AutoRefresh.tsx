"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** Polling interval in seconds (default: 5). */
  seconds?: number;
  /** When false the interval is not started (default: true). */
  active?: boolean;
}

/**
 * Invisible client component that calls router.refresh() on a fixed interval
 * while `active` is true. Used on run detail pages to re-fetch Server Component
 * data while the crew flow is still running (status="running").
 *
 * router.refresh() re-fetches RSC payload from the server without a full page
 * reload — the user sees updated status/result as the crew progresses.
 * The interval is cleared automatically when `active` becomes false
 * (e.g. when status transitions to completed/failed/cancelled).
 */
export function AutoRefresh({ seconds = 5, active = true }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(interval);
  }, [seconds, active, router]);

  return null;
}
