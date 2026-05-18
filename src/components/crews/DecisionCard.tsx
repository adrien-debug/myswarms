"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SPACING, FONT, RADIUS } from "@/lib/ui/tokens";
import type { P0Item } from "@/lib/crews/chiefTypes";

// Mirror of Python DEFAULT_SNOOZE_HOURS — keep in sync with chief_decision_store.py
const DEFAULT_SNOOZE_HOURS = 2;

// Contraste foncé sur --cos-accent (vert foncé sur fond clair).
const ACCENT_FG = "#08110d"; /* contraste foncé sur --cos-accent */

interface Props {
  p0Item: P0Item | null;
  draftText: string | null;
  runId: string | null;
}

export function DecisionCard({ p0Item, draftText, runId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"snoozed" | "rejected" | null>(null);

  const handleDecision = async (action: "snoozed" | "rejected") => {
    if (!runId || loading) return;
    setLoading(action);
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
    } catch (err) {
      console.error("Decision failed:", err);
      alert(`Échec de l'action ${action}`);
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
        <div style={{ fontSize: "2rem" /* 32px icon */ }}>🎯</div>
        <p
          style={{
            color: "var(--ct-text-muted)",
            marginTop: SPACING.md,
            fontSize: FONT.base,
          }}
        >
          Aucune décision prioritaire · Lancer un run pour voir ton P0
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
            fontWeight: 700,
            padding: `3px ${SPACING.sm}px`,
            borderRadius: RADIUS.sm,
            background: "color-mix(in srgb, var(--cos-p0) 10%, transparent)",
            color: "var(--cos-p0)",
          }}
        >
          P0 · à répondre
        </span>
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: 600,
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
            fontWeight: 600,
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
        De : {p0Item.from}
      </div>

      {/* Subject */}
      <h3
        style={{
          fontSize: FONT.lg,
          fontWeight: 700,
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
          background: "rgba(255,255,255,0.02)", // pas de token exact, valeur conservée
          borderRadius: `0 ${RADIUS.sm}px ${RADIUS.sm}px 0`,
          fontSize: FONT.base,
          color: "var(--ct-text-body)",
          lineHeight: 1.6,
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
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--cos-accent)",
              marginBottom: SPACING.sm,
            }}
          >
            Brouillon Draft Writer · Claude
          </div>
          <div
            style={{
              fontSize: FONT.base,
              color: "var(--ct-text-body)",
              lineHeight: 1.6,
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
          (Aucun brouillon — relancer un run avec AGENT_MOCK_MODE=false)
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: SPACING.sm, flexWrap: "wrap" }}>
        {/* E — Envoyer */}
        <button
          className="ct-seg-btn"
          disabled
          title="Phase 3 — approbation Composio Gmail requise"
          style={{
            position: "relative",
            padding: `${SPACING.sm}px ${SPACING.lg}px`,
            paddingBottom: SPACING.lx,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            color: "var(--ct-text-body)",
            fontSize: FONT.base,
            fontWeight: 600,
            cursor: "not-allowed",
            opacity: 0.4,
            fontFamily: "inherit",
          }}
        >
          E — Envoyer
          <kbd
            style={{
              position: "absolute",
              bottom: 4,
              right: 6,
              fontSize: FONT.nano,
              background: "rgba(255,255,255,0.1)", // pas de token exact, conservé
              borderRadius: RADIUS.xs,
              padding: "1px 4px", /* 1px non tokenisable proprement, acceptable */
              color: "var(--ct-text-faint)",
            }}
          >
            E
          </kbd>
        </button>

        {/* M — Modifier */}
        <button
          className="ct-seg-btn primary"
          onClick={() => runId && router.push(`/crews/chief-of-staff/runs/${runId}`)}
          disabled={!runId}
          style={{
            position: "relative",
            padding: `${SPACING.sm}px ${SPACING.lg}px`,
            paddingBottom: SPACING.lx,
            background: "var(--cos-accent)",
            border: "none",
            borderRadius: RADIUS.md,
            color: ACCENT_FG,
            fontSize: FONT.base,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          M — Modifier
          <kbd
            style={{
              position: "absolute",
              bottom: 4,
              right: 6,
              fontSize: FONT.nano,
              background: "rgba(0,0,0,0.2)", // pas de token exact, conservé
              borderRadius: RADIUS.xs,
              padding: "1px 4px", /* 1px non tokenisable proprement, acceptable */
              color: "rgba(0,0,0,0.6)",
            }}
          >
            M
          </kbd>
        </button>

        {/* S — Snooze */}
        <button
          className="ct-seg-btn"
          onClick={() => void handleDecision("snoozed")}
          disabled={!runId || loading !== null}
          style={{
            position: "relative",
            padding: `${SPACING.sm}px ${SPACING.lg}px`,
            paddingBottom: SPACING.lx,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            color: "var(--ct-text-body)",
            fontSize: FONT.base,
            fontWeight: 600,
            cursor: !runId || loading !== null ? "not-allowed" : "pointer",
            opacity: !runId ? 0.4 : 1,
            fontFamily: "inherit",
          }}
        >
          {loading === "snoozed" ? "…" : "S — Snooze 2h"}
          <kbd
            style={{
              position: "absolute",
              bottom: 4,
              right: 6,
              fontSize: FONT.nano,
              background: "rgba(255,255,255,0.1)", // pas de token exact, conservé
              borderRadius: RADIUS.xs,
              padding: "1px 4px", /* 1px non tokenisable proprement, acceptable */
              color: "var(--ct-text-faint)",
            }}
          >
            S
          </kbd>
        </button>

        {/* R — Rejeter */}
        <button
          className="ct-seg-btn"
          onClick={() => void handleDecision("rejected")}
          disabled={!runId || loading !== null}
          style={{
            position: "relative",
            padding: `${SPACING.sm}px ${SPACING.lg}px`,
            paddingBottom: SPACING.lx,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border)",
            borderRadius: RADIUS.md,
            color: "var(--cos-p0)",
            fontSize: FONT.base,
            fontWeight: 600,
            cursor: !runId || loading !== null ? "not-allowed" : "pointer",
            opacity: !runId ? 0.4 : 1,
            fontFamily: "inherit",
          }}
        >
          {loading === "rejected" ? "…" : "R — Rejeter"}
          <kbd
            style={{
              position: "absolute",
              bottom: 4,
              right: 6,
              fontSize: FONT.nano,
              background: "rgba(255,255,255,0.1)", // pas de token exact, conservé
              borderRadius: RADIUS.xs,
              padding: "1px 4px", /* 1px non tokenisable proprement, acceptable */
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
