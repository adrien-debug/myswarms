"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArchitectGenerateRequestSchema,
  type ArchitectResponse,
  type SwarmSpecResponse,
} from "@/lib/forms/swarmSchemas";
import { FONT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

// Pas de magic numbers : bornes prompt dérivées du même schema Zod que le BFF.
const PROMPT_MIN = ArchitectGenerateRequestSchema.shape.prompt.minLength ?? 10;
const PROMPT_MAX = ArchitectGenerateRequestSchema.shape.prompt.maxLength ?? 4000;

// Opacité de l'overlay (verre dépoli cockpit) — constante nommée.
const OVERLAY_BG = "rgba(8, 4, 6, 0.72)";
const SPINNER_SIZE = 28;
const MODAL_MAX_WIDTH = 560;
const MODAL_Z_INDEX = 1000;

type Phase = "idle" | "loading" | "error" | "success";

interface ArchitectModalProps {
  open: boolean;
  onClose: () => void;
  /** Appelé avec la spec générée (shape SwarmInputRaw) avant fermeture. */
  onGenerated: (spec: SwarmSpecResponse) => void;
}

export function ArchitectModal({
  open,
  onClose,
  onGenerated,
}: ArchitectModalProps) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ArchitectResponse | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  const promptValid =
    prompt.trim().length >= PROMPT_MIN && prompt.length <= PROMPT_MAX;
  const pending = phase === "loading";

  // Focus initial sur le textarea à l'ouverture. Le reset d'état est assuré
  // par un remount (clé `open-…` côté SwarmBuilder), donc pas de setState
  // dans cet effect (lint react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Fermeture via Échap + focus trap basique (Tab cyclique dans le dialog).
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && !pending) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose, pending],
  );

  const generate = useCallback(async () => {
    if (!promptValid || pending) return;
    setPhase("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/swarms/architect/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ?? `Échec de la génération (${res.status})`,
        );
      }
      const data = (await res.json()) as ArchitectResponse;
      setResult(data);
      setPhase("success");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erreur inconnue de l'architecte",
      );
      setPhase("error");
    }
  }, [prompt, promptValid, pending]);

  // En succès : injecte la spec dans le builder puis ferme (après un court
  // affichage du rationale / warnings).
  const applyResult = useCallback(() => {
    if (!result) return;
    onGenerated(result.spec);
    onClose();
  }, [result, onGenerated, onClose]);

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        // Clic sur l'overlay (hors carte) = fermeture, sauf pendant le run.
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      {/* Keyframe spinner injecté localement (cockpit.css intouchable). */}
      <style>{`@keyframes ct-architect-spin{to{transform:rotate(360deg)}}`}</style>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="ct-card"
        style={cardStyle}
        onKeyDown={handleKeyDown}
      >
        <div style={headerStyle}>
          <div>
            <div className="ct-eyebrow">Architect Agent</div>
            <div id={titleId} className="ct-card-title" style={{ marginTop: SPACING.xs }}>
              Générer un swarm avec l&apos;IA
            </div>
          </div>
          <button
            type="button"
            className="ct-seg-btn"
            aria-label="Fermer la fenêtre de génération"
            onClick={onClose}
            disabled={pending}
            style={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <p id={descId} className="ct-card-body" style={{ marginBottom: SPACING.md }}>
          Décris ce que ton swarm doit faire. L&apos;architecte propose une
          composition d&apos;agents et de tâches que tu pourras éditer avant de
          créer le swarm.
        </p>

        {(phase === "idle" || phase === "error") && (
          <>
            <label style={labelStyle}>
              <span style={labelText}>Description en langage naturel</span>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                maxLength={PROMPT_MAX}
                disabled={pending}
                aria-label="Description du swarm à générer"
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="ex: lis mes emails non lus, classe-les par priorité, rédige un résumé quotidien et planifie les actions urgentes dans mon calendrier"
              />
              <span style={hintStyle}>
                {prompt.trim().length}/{PROMPT_MAX} — minimum {PROMPT_MIN}{" "}
                caractères
              </span>
            </label>

            {phase === "error" && errorMsg ? (
              <div
                role="alert"
                style={errorBoxStyle}
              >
                {errorMsg}
              </div>
            ) : null}
          </>
        )}

        {phase === "loading" && (
          <div style={loadingBoxStyle} aria-live="polite">
            <span style={spinnerStyle} aria-hidden="true" />
            <span>L&apos;architecte conçoit ton swarm…</span>
          </div>
        )}

        {phase === "success" && result && (
          <div style={successBoxStyle} aria-live="polite">
            <div style={labelText}>Spec générée</div>
            <p className="ct-card-body" style={{ margin: 0 }}>
              <strong>{result.spec.name || "Swarm sans nom"}</strong> —{" "}
              {result.spec.agents?.length ?? 0} agent(s),{" "}
              {result.spec.tasks?.length ?? 0} tâche(s).
            </p>
            {result.rationale ? (
              <p className="ct-card-body" style={{ margin: 0 }}>
                {result.rationale}
              </p>
            ) : null}
            {result.warnings.length > 0 ? (
              <ul style={warningListStyle}>
                {result.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div style={footerStyle}>
          <button
            type="button"
            className="ct-seg-btn"
            onClick={onClose}
            disabled={pending}
          >
            Annuler
          </button>
          {phase === "success" ? (
            <button
              type="button"
              className="ct-seg-btn primary"
              onClick={applyResult}
            >
              Injecter dans le builder
            </button>
          ) : (
            <button
              type="button"
              className="ct-seg-btn primary"
              onClick={generate}
              disabled={!promptValid || pending}
            >
              {pending
                ? "Génération…"
                : phase === "error"
                  ? "Réessayer"
                  : "Générer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles (tokens UI, pas de magic numbers) ───────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: MODAL_Z_INDEX,
  background: OVERLAY_BG,
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: SPACING.lg,
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: MODAL_MAX_WIDTH,
  maxHeight: "90vh",
  overflowY: "auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: SPACING.md,
  marginBottom: SPACING.md,
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xxs,
};

const labelText: CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: 600,
  letterSpacing: LETTER_SPACING.tight,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};

const inputStyle: CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
  outline: "none",
};

const hintStyle: CSSProperties = {
  fontSize: FONT.xs,
  color: "var(--ct-text-muted)",
};

const errorBoxStyle: CSSProperties = {
  marginTop: SPACING.md,
  border: "1px solid var(--ct-border-accent)",
  background: "var(--ct-accent-soft)",
  borderRadius: RADIUS.md,
  padding: SPACING.md,
  fontSize: FONT.base,
  color: "var(--ct-text-primary)",
};

const loadingBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACING.md,
  padding: `${SPACING.xl}px ${SPACING.md}px`,
  fontSize: FONT.base,
  color: "var(--ct-text-primary)",
};

const spinnerStyle: CSSProperties = {
  width: SPINNER_SIZE,
  height: SPINNER_SIZE,
  borderRadius: RADIUS.full,
  border: "3px solid var(--ct-border)",
  borderTopColor: "var(--ct-accent-strong)",
  display: "inline-block",
  animation: "ct-architect-spin 0.8s linear infinite",
};

const successBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.sm,
  border: "1px solid var(--ct-border)",
  background: "var(--ct-surface-2)",
  borderRadius: RADIUS.md,
  padding: SPACING.md,
};

const warningListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: SPACING.lg,
  fontSize: FONT.sm,
  color: "var(--ct-text-muted)",
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xs,
};

const footerStyle: CSSProperties = {
  display: "flex",
  gap: SPACING.sm,
  justifyContent: "flex-end",
  marginTop: SPACING.xl,
};
