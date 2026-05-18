"use client";

import { useEffect, useState, useCallback } from "react";
import { SPACING } from "@/lib/ui/tokens";

type EngineStatus = "up" | "down" | "starting" | "unknown";

export function LaunchButton() {
  const [status, setStatus] = useState<EngineStatus>("unknown");
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/system/status");
      const data = await res.json();
      setStatus(data.engine === "up" ? "up" : "down");
    } catch {
      setStatus("unknown");
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleLaunch = async () => {
    if (status === "up" || loading) return;
    setLoading(true);
    setStatus("starting");
    try {
      await fetch("/api/system/start", { method: "POST" });
      // Poll jusqu'à up
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const res = await fetch("/api/system/status");
        const data = await res.json();
        if (data.engine === "up") {
          setStatus("up");
          break;
        }
      }
    } finally {
      setLoading(false);
      checkStatus();
    }
  };

  // Utilise les variables CSS du design system cockpit (--ct-status-*)
  const dotColor =
    status === "up" ? "var(--ct-status-completed)" :
    status === "starting" ? "var(--ct-status-paused)" :
    status === "down" ? "var(--ct-status-failed)" :
    "var(--ct-text-muted)";

  const label =
    status === "up" ? "Engine ●" :
    status === "starting" ? "Starting…" :
    status === "down" ? "▶ Launch" :
    "Engine";

  return (
    <button
      type="button"
      onClick={handleLaunch}
      disabled={status === "up" || status === "starting"}
      className="ct-seg-btn"
      title={status === "up" ? "Engine running" : "Click to start engine"}
      style={{
        color: dotColor,
        fontWeight: status === "down" ? 700 : undefined,
        cursor: status === "up" ? "default" : "pointer",
        gap: SPACING.xs,
        minWidth: 90,
      }}
    >
      {label}
    </button>
  );
}
