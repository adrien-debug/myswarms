"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BLUR,
  COLOR,
  FONT,
  FONT_WEIGHT,
  LINE_HEIGHT,
  RADIUS,
  SPACING,
  Z_INDEX,
} from "@/lib/ui/tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertDialogVariant = "destructive" | "warning" | "default";

export interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  /** Peut être async — busy géré automatiquement pendant l'attente. */
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  /** Contenu optionnel pour lister les impacts (tâches orphelines, etc.). */
  impact?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AlertDialogVariant;
  /** Forçage externe du état busy (ex: action déjà en cours dans le parent). */
  busy?: boolean;
}

// ─── Composant ───────────────────────────────────────────────────────────────

const MODAL_MAX_WIDTH = 440;

export function AlertDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  impact,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy: externalBusy = false,
}: AlertDialogProps) {
  const [internalBusy, setInternalBusy] = useState(false);
  const busy = externalBusy || internalBusy;

  const titleId = useId();
  const descId = useId();

  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  // Capture l'élément actif avant ouverture pour restaurer le focus à la fermeture.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Capture le focus actif à l'ouverture.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  // Focus initial sur Annuler (focus de sécurité — pas Confirmer).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => cancelBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Restauration du focus à la fermeture.
  useEffect(() => {
    if (!open && returnFocusRef.current) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  // Escape + focus trap Tab/Shift+Tab.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
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
    [onClose, busy],
  );

  // Auto-close après onConfirm; le consommateur peut throw pour empêcher la fermeture.
  const handleConfirm = useCallback(async () => {
    if (internalBusy) return;
    setInternalBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Le consommateur peut throw pour empêcher la fermeture (ex: erreur réseau visible)
    } finally {
      setInternalBusy(false);
    }
  }, [onConfirm, onClose, internalBusy]);

  // Render conditionnel — pas de display:none.
  if (!open) return null;

  const confirmBtnStyle: CSSProperties =
    variant === "destructive"
      ? destructiveBtnStyle
      : variant === "warning"
        ? warningBtnStyle
        : defaultConfirmBtnStyle;

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="ct-card"
        style={cardStyle}
        onKeyDown={handleKeyDown}
      >
        {/* Titre */}
        <div id={titleId} className="ct-card-title" style={titleStyle}>
          {title}
        </div>

        {/* Description */}
        {description ? (
          <p id={descId} className="ct-card-body" style={descStyle}>
            {description}
          </p>
        ) : (
          // aria-describedby doit pointer vers un élément existant.
          <span id={descId} style={{ display: "none" }} />
        )}

        {/* Zone d'impact optionnelle */}
        {impact ? <div style={impactStyle}>{impact}</div> : null}

        {/* Footer */}
        <div style={footerStyle}>
          <button
            ref={cancelBtnRef}
            type="button"
            className="ct-seg-btn"
            onClick={onClose}
            disabled={busy}
            aria-disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            style={confirmBtnStyle}
            onClick={handleConfirm}
            disabled={busy}
            aria-disabled={busy}
          >
            {busy ? "Confirming…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles (tokens UI — pas de magic numbers) ───────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: Z_INDEX.modal,
  background: COLOR.overlayModal,
  backdropFilter: BLUR.modalLight,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: SPACING.lg,
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: MODAL_MAX_WIDTH,
};

const titleStyle: CSSProperties = {
  marginBottom: SPACING.sm,
};

const descStyle: CSSProperties = {
  margin: 0,
  marginBottom: SPACING.md,
  color: "var(--ct-text-muted)",
};

const impactStyle: CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: SPACING.md,
  marginBottom: SPACING.md,
  fontSize: FONT.sm,
  color: "var(--ct-text-muted)",
};

const footerStyle: CSSProperties = {
  display: "flex",
  gap: SPACING.sm,
  justifyContent: "flex-end",
  marginTop: SPACING.lg,
};

// Bouton destructif : fond bordeaux (--ct-accent-strong), texte blanc.
const destructiveBtnStyle: CSSProperties = {
  background: "var(--ct-accent-strong)",
  border: "1px solid var(--ct-accent-strong)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.xxs}px ${SPACING.lg}px`,
  color: "var(--ct-text-strong)",
  fontSize: FONT.base,
  fontWeight: FONT_WEIGHT.semibold,
  fontFamily: "inherit",
  cursor: "pointer",
  lineHeight: LINE_HEIGHT.base,
};

// Bouton warning : fond surface avec bordure accent.
const warningBtnStyle: CSSProperties = {
  background: "var(--ct-alert-warning-bg, var(--ct-surface-2))",
  border: "1px solid var(--ct-alert-warning-border, var(--ct-border-accent))",
  borderRadius: RADIUS.md,
  padding: `${SPACING.xxs}px ${SPACING.lg}px`,
  color: "var(--ct-alert-warning-text, var(--ct-text-primary))",
  fontSize: FONT.base,
  fontWeight: FONT_WEIGHT.semibold,
  fontFamily: "inherit",
  cursor: "pointer",
  lineHeight: LINE_HEIGHT.base,
};

// Bouton default : réutilise la classe ct-seg-btn primary via style similaire.
const defaultConfirmBtnStyle: CSSProperties = {
  background: "var(--ct-accent-soft)",
  border: "1px solid var(--ct-border-accent)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.xxs}px ${SPACING.lg}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontWeight: FONT_WEIGHT.semibold,
  fontFamily: "inherit",
  cursor: "pointer",
  lineHeight: LINE_HEIGHT.base,
};
