"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArchitectGenerateRequestSchema,
  type ArchitectResponse,
  type SwarmInput,
} from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";
import { AlertDialog } from "@/components/ui/AlertDialog";
import Modal from "@/components/ui/Modal";

// Pas de magic numbers : bornes prompt dérivées du même schema Zod que le BFF.
const PROMPT_MIN = ArchitectGenerateRequestSchema.shape.prompt.minLength ?? 10;
const PROMPT_MAX = ArchitectGenerateRequestSchema.shape.prompt.maxLength ?? 4000;

const SPINNER_SIZE = 28;
const MODAL_MAX_WIDTH = 560;

type Phase = "idle" | "loading" | "error" | "success";

interface ArchitectModalProps {
  open: boolean;
  onClose: () => void;
  /** Appelé avec la spec générée avant fermeture. */
  onGenerated: (spec: SwarmInput) => void;
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
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descId = useId();

  const promptValid =
    prompt.trim().length >= PROMPT_MIN && prompt.length <= PROMPT_MAX;
  const pending = phase === "loading";

  // tryClose : intercepte la fermeture si une spec a été générée mais pas encore injectée.
  const tryClose = useCallback(() => {
    if (phase === "success" && result) {
      setShowCloseWarning(true);
    } else {
      onClose();
    }
  }, [phase, result, onClose]);

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
    <>
    <AlertDialog
      open={showCloseWarning}
      onClose={() => setShowCloseWarning(false)}
      onConfirm={() => { setShowCloseWarning(false); onClose(); }}
      title="Quitter sans injecter la spec ?"
      description="La spec générée sera perdue. L'appel IA reste consommé."
      confirmLabel="Quitter sans injecter"
      cancelLabel="Rester"
      variant="warning"
    />
    <Modal
      open={open}
      onClose={tryClose}
      ariaLabelledBy={titleId}
      ariaDescribedBy={descId}
      initialFocusRef={textareaRef}
      maxWidth={MODAL_MAX_WIDTH}
    >
      {/* Keyframe spinner injecté localement. */}
      <style>{`@keyframes ct-architect-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={headerStyle}>
        <div>
          <div className="ct-eyebrow">Architect Agent</div>
          <h2 id={titleId} className="ct-card-title" style={{ marginTop: SPACING.xs }}>
            Générer un swarm avec l&apos;IA
          </h2>
        </div>
        <button
          type="button"
          className="ct-seg-btn"
          aria-label="Fermer la fenêtre de génération"
          onClick={tryClose}
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
          onClick={tryClose}
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
    </Modal>
    </>
  );
}

// ─── Styles (tokens UI, pas de magic numbers) ───────────────────────────────

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
  fontWeight: FONT_WEIGHT.semibold,
  letterSpacing: LETTER_SPACING.tight,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};

const inputStyle: CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.s}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
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
