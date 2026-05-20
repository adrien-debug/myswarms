"use client";

import { useEffect, useState, useCallback } from "react";
import { FONT, FONT_WEIGHT, SPACING } from "@/lib/ui/tokens";

type EngineStatus = "up" | "down" | "starting" | "unknown";

const ENGINE_POLL_INTERVAL_MS = 5000;
const ENGINE_START_POLL_DELAY_MS = 1000;
const ENGINE_START_MAX_ATTEMPTS = 20;

export function LaunchButton() {
  const [status, setStatus] = useState<EngineStatus>("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/system/status");
      const data = await res.json();
      if (data.engine === "ok") {
        setStatus("up");
        setError(null);  // clear error sur recovery automatique
      } else {
        setStatus("down");
      }
    } catch {
      setStatus("unknown");
    }
  }, []);

  useEffect(() => {
    if (status === "up") return;
    // setTimeout 0 évite l'appel synchrone setState-in-effect
    const t = setTimeout(checkStatus, 0);
    const interval = setInterval(checkStatus, ENGINE_POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.hidden) clearInterval(interval);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkStatus, status]);

  const handleLaunch = async () => {
    if (status === "up" || loading) return;
    setLoading(true);
    setError(null);
    setStatus("starting");
    try {
      const startRes = await fetch("/api/system/start", { method: "POST" });
      if (!startRes.ok) {
        throw new Error("Cannot start — engine unreachable");
      }
      let started = false;
      for (let i = 0; i < ENGINE_START_MAX_ATTEMPTS; i++) {
        await new Promise(r => setTimeout(r, ENGINE_START_POLL_DELAY_MS));
        const res = await fetch("/api/system/status");
        const data = await res.json();
        if (data.engine === "ok") {
          setStatus("up");
          started = true;
          break;
        }
      }
      if (!started) {
        setError(`Engine did not start after ${ENGINE_START_MAX_ATTEMPTS}s — check logs`);
        setStatus("down");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot start — engine unreachable");
      setStatus("down");
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

  const isDisabled = status === "up" || status === "starting";
  const titleText = error
    ? error
    : status === "up"
      ? "Engine running"
      : "Click to start the engine";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
      <button
        type="button"
        onClick={handleLaunch}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className="ct-seg-btn"
        title={titleText}
        aria-label={`CrewAI engine — ${label}${status === "down" ? ". Click to start." : ""}`}
        style={{
          color: dotColor,
          fontWeight: status === "down" ? FONT_WEIGHT.bold : undefined,
          cursor: status === "up" ? "default" : "pointer",
          gap: SPACING.xs,
          minWidth: "var(--ct-launch-btn-min-w)",
        }}
      >
        <span aria-live="polite">{label}</span>
      </button>
      {error && (
        <span
          role="alert"
          aria-live="polite"
          style={{
            fontSize: FONT.xs,
            color: "var(--ct-accent-strong)",
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
