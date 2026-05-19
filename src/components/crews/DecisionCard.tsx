"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { P0Item } from "@/lib/crews/chiefTypes";
import CtButton from "@/components/ui/CtButton";

// ─── Composant local ActionButton ────────────────────────────────────────────
interface ActionButtonProps {
  label: React.ReactNode;
  kbd?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  title?: string;
  ariaLabel?: string;
  danger?: boolean;
  loading?: boolean;
  style?: React.CSSProperties;
}

function ActionButton({
  label,
  kbd,
  onClick,
  disabled,
  variant = "secondary",
  title,
  ariaLabel,
  danger,
  loading,
  style,
}: ActionButtonProps) {
  return (
    <CtButton
      variant={variant === "primary" ? "primary" : "ghost"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      loading={loading}
      style={{
        position: "relative",
        paddingRight: 32,
        ...(danger ? { color: "var(--cos-p0)" } : null),
        ...style,
      }}
    >
      {label}
      {kbd && (
        <kbd
          style={{
            position: "absolute",
            bottom: 3,
            right: 6,
            fontSize: 9,
            background: variant === "primary" ? "var(--ct-overlay-dark)" : "var(--ct-surface-3)",
            borderRadius: 3,
            padding: "1px 4px",
            color: variant === "primary" ? "var(--ct-overlay-dark-strong)" : "var(--ct-text-faint)",
          }}
        >
          {kbd}
        </kbd>
      )}
    </CtButton>
  );
}

// Mirror of Python DEFAULT_SNOOZE_HOURS — keep in sync with chief_decision_store.py
const DEFAULT_SNOOZE_HOURS = 2;

// Délai d'annulation en ms avant commit de l'action
const UNDO_DELAY_MS = 3000;

interface PendingAction {
  type: "snoozed" | "rejected";
  until: number;
}

interface Props {
  p0Item: P0Item | null;
  draftText: string | null;
  runId: string | null;
}

export function DecisionCard({ p0Item, draftText, runId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"snoozed" | "rejected" | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref miroir pour accéder à pendingAction sans fermeture stale dans le handler keydown.
  const pendingActionRef = useRef<PendingAction | null>(null);

  const commitDecision = async (action: "snoozed" | "rejected") => {
    if (!runId || loading) return;
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
    } catch (err) {
      setDecisionError(`Échec de l'action ${action} — ${err instanceof Error ? err.message : "erreur inconnue"}`);
    } finally {
      setLoading(null);
    }
  };

  const triggerDecision = (action: "snoozed" | "rejected") => {
    if (!runId || loading) return;
    // Annuler tout timer précédent
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
    }
    const next = { type: action, until: Date.now() + UNDO_DELAY_MS };
    pendingActionRef.current = next;
    setPendingAction(next);
    pendingTimerRef.current = setTimeout(async () => {
      pendingActionRef.current = null;
      setPendingAction(null);
      pendingTimerRef.current = null;
      await commitDecision(action);
    }, UNDO_DELAY_MS);
  };

  const cancelPending = () => {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    pendingActionRef.current = null;
    setPendingAction(null);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!p0Item || !runId) return;

    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput = !!target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );

      // Escape annule la pendingAction même si le focus est dans un input
      if (e.key === "Escape") {
        if (pendingActionRef.current) {
          cancelPending();
          e.preventDefault();
        }
        return;
      }

      if (inInput) return;

      const key = e.key.toLowerCase();
      if (key === "m") {
        router.push(`/crews/chief-of-staff/runs/${runId}`);
      } else if (key === "s") {
        triggerDecision("snoozed");
      } else if (key === "r") {
        triggerDecision("rejected");
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p0Item, runId, router, loading]);

  if (!p0Item) {
    return (
      <div className="ct-card" style={{ textAlign: "center", padding: 32 }}>
        <p className="ct-placeholder">
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
        borderColor: "var(--ct-border-accent)",
        background: `color-mix(in srgb, var(--ct-accent-soft) 60%, var(--ct-surface-1))`,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Eyebrow + meta pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="ct-eyebrow" style={{ marginBottom: 0 }}>
          P0 · ACTION REQUIRED
        </span>
        <span
          className="status-badge"
          style={{
            background: "color-mix(in srgb, var(--cos-p0) 10%, transparent)",
            color: "var(--cos-p0)",
            border: "none",
          }}
        >
          {channelEmoji} {channel}
        </span>
        <span className="status-badge">
          Classifier · 92%
        </span>
      </div>

      {/* From */}
      <div className="ct-card-body" style={{ color: "var(--ct-text-muted)" }}>
        De : {p0Item.from}
      </div>

      {/* Subject */}
      <h2 style={{ fontWeight: 700, fontSize: 18, color: "var(--ct-text-strong)", margin: 0 }}>
        {p0Item.subject}
      </h2>

      {/* Context */}
      <div
        style={{
          borderLeft: "2px solid var(--ct-border-accent)",
          paddingLeft: 16,
          paddingTop: 8,
          paddingBottom: 8,
          background: "var(--ct-surface-0)",
          borderRadius: "0 4px 4px 0",
          fontSize: 13,
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
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--cos-accent)",
              marginBottom: 8,
            }}
          >
            Brouillon Draft Writer · Claude
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--ct-text-body)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {draftText}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--ct-text-faint)", fontStyle: "italic" }}>
          (Aucun brouillon — relancer un run avec AGENT_MOCK_MODE=false)
        </div>
      )}

      {/* Erreur décision */}
      {decisionError && (
        <div
          role="alert"
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            background: "var(--ct-alert-error-bg)",
            border: "1px solid var(--ct-alert-error-border)",
            color: "var(--ct-alert-error-text)",
            fontSize: 12,
          }}
        >
          {decisionError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* E — Envoyer (Phase 3, non disponible) */}
        <ActionButton
          label="E — Envoyer"
          kbd="E"
          disabled
          title="Bientôt disponible (Phase 3)"
          ariaLabel="Envoyer — bientôt disponible"
          variant="secondary"
        />

        {/* M — Modifier (action principale) */}
        <ActionButton
          label="M — Modifier"
          kbd="M"
          onClick={() => runId && router.push(`/crews/chief-of-staff/runs/${runId}`)}
          disabled={!runId}
          variant="primary"
          style={{
            background: "var(--cos-accent)",
            color: "var(--ct-bg-deep)",
          }}
        />

        {/* S — Snooze */}
        <ActionButton
          label="S — Snooze 2h"
          kbd="S"
          onClick={() => triggerDecision("snoozed")}
          disabled={!runId || loading !== null || pendingAction !== null}
          loading={loading === "snoozed"}
          variant="secondary"
        />

        {/* R — Rejeter */}
        <ActionButton
          label="R — Rejeter"
          kbd="R"
          onClick={() => triggerDecision("rejected")}
          disabled={!runId || loading !== null || pendingAction !== null}
          loading={loading === "rejected"}
          variant="secondary"
          danger
        />
      </div>

      {/* Bandeau undo — action en attente */}
      {pendingAction && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 12px",
            borderRadius: 4,
            borderLeft: "3px solid var(--ct-accent-strong)",
            background: "var(--ct-alert-warning-bg)",
            border: "1px solid var(--ct-alert-warning-border)",
            color: "var(--ct-alert-warning-text)",
            fontSize: 12,
          }}
        >
          <span>
            {pendingAction.type === "rejected"
              ? "Décision rejetée"
              : "Décision snoozée"}
            {" "}— annule sous 3s
          </span>
          <ActionButton
            label="Annuler"
            onClick={cancelPending}
            variant="secondary"
            style={{
              padding: "3px 8px",
              paddingRight: 8,
              borderRadius: 3,
              fontSize: 12,
              border: "1px solid var(--ct-alert-warning-border)",
              color: "var(--ct-alert-warning-text)",
            }}
          />
        </div>
      )}
    </div>
  );
}
