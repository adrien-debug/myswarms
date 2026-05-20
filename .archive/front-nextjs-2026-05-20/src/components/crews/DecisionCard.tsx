"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SPACING, FONT, RADIUS, FONT_WEIGHT, LETTER_SPACING, LINE_HEIGHT } from "@/lib/ui/tokens";
import type { P0Item } from "@/lib/crews/chiefTypes";

// Mirror of Python DEFAULT_SNOOZE_HOURS — keep in sync with chief_decision_store.py
const DEFAULT_SNOOZE_HOURS = 2;


interface Props {
  p0Item: P0Item | null;
  draftText: string | null;
  runId: string | null;
}

export function DecisionCard({ p0Item, draftText, runId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"snoozed" | "rejected" | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const committedRef = useRef(false);

  const handleDecision = async (action: "snoozed" | "rejected") => {
    if (committedRef.current) return;
    if (!runId || loading) return;
    committedRef.current = true;
    setCommitted(true);
    setLoading(action);
    setDecisionError(null);
    try {
      const payload: Record<string, unknown> = { kickoff_id: runId, action };
      if (action === "snoozed") payload.snooze_hours = DEFAULT_SNOOZE_HOURS;
      const res = await fetch("/api/crews/chief-of-staff/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch {
      setDecisionError(`Action ${action} failed`);
      committedRef.current = false;
      setCommitted(false);
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    if (!p0Item || !runId) return;

    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "e") {
        // Phase 3 — approbation Composio Gmail requise
      } else if (key === "m") {
        router.push(`/crews/chief-of-staff/runs/${runId}`);
      } else if (key === "s") {
        void handleDecision("snoozed");
      } else if (key === "r") {
        void handleDecision("rejected");
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p0Item, runId, router, loading]);

  if (!p0Item) {
    return (
      <div
        className="ct-card"
        style={{ textAlign: "center", padding: SPACING.xxl }}
      >
        <div style={{ fontSize: FONT.iconLg }}>🎯</div>
        <p
          style={{
            color: "var(--ct-text-muted)",
            marginTop: SPACING.md,
            fontSize: FONT.base,
          }}
        >
          No priority decision · Start a run to see your P0
        </p>
      </div>
    );
  }

  const channel = p0Item.channel ?? "Gmail";
  const channelEmoji = channel.toLowerCase().includes("gmail") ? "📧" : "💬";

  return (
    <div
      className="ct-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SPACING.lg,
      }}
    >
      {/* Meta pills */}
      <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: FONT_WEIGHT.bold,
            padding: `3px ${SPACING.sm}px`,
            borderRadius: RADIUS.sm,
            background: "color-mix(in srgb, var(--cos-p0) 10%, transparent)",
            color: "var(--cos-p0)",
          }}
        >
          P0 · to reply
        </span>
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: FONT_WEIGHT.semibold,
            padding: `3px ${SPACING.sm}px`,
            borderRadius: RADIUS.sm,
            background: "var(--ct-surface-2)",
            color: "var(--ct-text-muted)",
          }}
        >
          {channelEmoji} {channel}
        </span>
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: FONT_WEIGHT.semibold,
            padding: `3px ${SPACING.sm}px`,
            borderRadius: RADIUS.sm,
            background: "var(--ct-surface-2)",
            color: "var(--ct-text-muted)",
          }}
        >
          Classifier · 92%
        </span>
      </div>

      {/* From */}
      <div
        style={{
          fontSize: FONT.sm,
          color: "var(--ct-text-muted)",
        }}
      >
        From: {p0Item.from}
      </div>

      {/* Subject */}
      <h3
        style={{
          fontSize: FONT.lg,
          fontWeight: FONT_WEIGHT.bold,
          color: "var(--ct-text-primary)",
          margin: 0,
        }}
      >
        {p0Item.subject}
      </h3>

      {/* Context */}
      <div
        style={{
          borderLeft: "2px solid var(--ct-border)",
          paddingLeft: SPACING.lg,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING.sm,
          background: "var(--ct-surface-0)",
          borderRadius: `0 ${RADIUS.sm}px ${RADIUS.sm}px 0`,
          fontSize: FONT.base,
          color: "var(--ct-text-body)",
          lineHeight: LINE_HEIGHT.base,
        }}
      >
        {p0Item.action}
      </div>

      {/* Draft block */}
      {draftText ? (
        <div
          style={{
            background: "color-mix(in srgb, var(--cos-accent) 4%, transparent)",
            border: "1px dashed var(--cos-accent-border)",
            borderRadius: RADIUS.md,
            padding: SPACING.lg,
          }}
        >
          <div
            style={{
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--cos-accent)",
              marginBottom: SPACING.sm,
            }}
          >
            Draft Writer · Claude
          </div>
          <div
            style={{
              fontSize: FONT.base,
              color: "var(--ct-text-body)",
              lineHeight: LINE_HEIGHT.base,
              whiteSpace: "pre-wrap",
            }}
          >
            {draftText}
          </div>
        </div>
      ) : (
        <div
          style={{
            fontSize: FONT.sm,
            color: "var(--ct-text-faint)",
            fontStyle: "italic",
          }}
        >
          (No draft — re-run with AGENT_MOCK_MODE=false)
        </div>
      )}

      {/* Erreur décision */}
      {decisionError && (
        <div
          role="alert"
          style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`,
            borderRadius: RADIUS.sm,
            background: "var(--ct-alert-error-bg)",
            border: "1px solid var(--ct-alert-error-border)",
            color: "var(--ct-alert-error-text)",
            fontSize: FONT.sm,
          }}
        >
          {decisionError}
        </div>
      )}

      {/* Statut après commit */}
      {committed && (
        <p
          role="status"
          aria-live="polite"
          style={{
            fontSize: FONT.sm,
            color: "var(--ct-text-muted)",
            fontStyle: "italic",
          }}
        >
          Decision sent — refreshing…
        </p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: SPACING.sm, flexWrap: "wrap" }}>
        {/* E — Send */}
        <button
          className="ct-seg-btn"
          disabled
          title="Phase 3 — Composio Gmail approval required"
          style={{
            position: "relative",
            padding: `${SPACING.md}px ${SPACING.lg}px`,
            paddingRight: SPACING.xxl,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            color: "var(--ct-text-body)",
            fontSize: FONT.base,
            fontWeight: FONT_WEIGHT.semibold,
            cursor: "not-allowed",
            opacity: 0.4,
            fontFamily: "inherit",
          }}
        >
          E — Send
          <kbd
            style={{
              position: "absolute",
              bottom: SPACING.xs,
              right: SPACING.sm,
              fontSize: FONT.nano,
              background: "var(--ct-surface-3)",
              borderRadius: RADIUS.xs,
              padding: "1px 4px",
              color: "var(--ct-text-faint)",
            }}
          >
            E
          </kbd>
        </button>

        {/* M — Edit */}
        <button
          className="ct-seg-btn primary"
          onClick={() => runId && router.push(`/crews/chief-of-staff/runs/${runId}`)}
          disabled={!runId || committed}
          aria-disabled={committed}
          style={{
            position: "relative",
            padding: `${SPACING.md}px ${SPACING.lg}px`,
            paddingRight: SPACING.xxl,
            background: "var(--cos-accent)",
            border: "none",
            borderRadius: RADIUS.md,
            color: "var(--ct-text-on-accent)",
            fontSize: FONT.base,
            fontWeight: FONT_WEIGHT.bold,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          M — Edit
          <kbd
            style={{
              position: "absolute",
              bottom: SPACING.xs,
              right: SPACING.sm,
              fontSize: FONT.nano,
              background: "var(--ct-overlay-dark)",
              borderRadius: RADIUS.xs,
              padding: "1px 4px",
              color: "var(--ct-overlay-dark-strong)",
            }}
          >
            M
          </kbd>
        </button>

        {/* S — Snooze */}
        <button
          className="ct-seg-btn"
          onClick={() => void handleDecision("snoozed")}
          disabled={!runId || loading !== null || committed}
          aria-disabled={committed}
          style={{
            position: "relative",
            padding: `${SPACING.md}px ${SPACING.lg}px`,
            paddingRight: SPACING.xxl,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            color: "var(--ct-text-body)",
            fontSize: FONT.base,
            fontWeight: FONT_WEIGHT.semibold,
            cursor: !runId || loading !== null || committed ? "not-allowed" : "pointer",
            opacity: !runId || committed ? 0.4 : 1,
            fontFamily: "inherit",
          }}
        >
          {loading === "snoozed" ? "…" : "S — Snooze 2h"}
          <kbd
            style={{
              position: "absolute",
              bottom: SPACING.xs,
              right: SPACING.sm,
              fontSize: FONT.nano,
              background: "var(--ct-surface-3)",
              borderRadius: RADIUS.xs,
              padding: "1px 4px",
              color: "var(--ct-text-faint)",
            }}
          >
            S
          </kbd>
        </button>

        {/* R — Reject */}
        <button
          className="ct-seg-btn"
          onClick={() => void handleDecision("rejected")}
          disabled={!runId || loading !== null || committed}
          aria-disabled={committed}
          style={{
            position: "relative",
            padding: `${SPACING.md}px ${SPACING.lg}px`,
            paddingRight: SPACING.xxl,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            color: "var(--cos-p0)",
            fontSize: FONT.base,
            fontWeight: FONT_WEIGHT.semibold,
            cursor: !runId || loading !== null || committed ? "not-allowed" : "pointer",
            opacity: !runId || committed ? 0.4 : 1,
            fontFamily: "inherit",
          }}
        >
          {loading === "rejected" ? "…" : "R — Reject"}
          <kbd
            style={{
              position: "absolute",
              bottom: SPACING.xs,
              right: SPACING.sm,
              fontSize: FONT.nano,
              background: "var(--ct-surface-3)",
              borderRadius: RADIUS.xs,
              padding: "1px 4px",
              color: "var(--ct-text-faint)",
            }}
          >
            R
          </kbd>
        </button>
      </div>
    </div>
  );
}
