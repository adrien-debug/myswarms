"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BLUR, COLOR, RADIUS, SPACING, Z_INDEX } from "@/lib/ui/tokens";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  maxWidth?: number;
  children: ReactNode;
  ariaLabel?: string;
  /** Id de l'élément qui sert de label au dialog (prime sur ariaLabel quand fourni). */
  ariaLabelledBy?: string;
  /** Id de l'élément qui décrit le dialog (optionnel). */
  ariaDescribedBy?: string;
  /** Si fournie, cet élément reçoit le focus initial au lieu du premier focusable. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  maxWidth = 560,
  children,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  initialFocusRef,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  // Effect 1 — scroll-lock body
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Effect 2 : capture du focus actif à l'ouverture + focus initial
  useEffect(() => {
    if (!open) return;
    if (previousFocusRef.current === null) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    }

    const t = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        const card = cardRef.current;
        if (!card) return;
        const first = card.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        first?.focus();
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [open, initialFocusRef]);

  // Effect 3 : restitution du focus UNIQUEMENT quand open repasse à false
  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

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
    position: "relative",
    width: "100%",
    maxWidth,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "var(--ct-surface-1)",
    border: "1px solid var(--ct-border)",
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
  };

  return createPortal(
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        mouseDownTargetRef.current = e.target;
      }}
      onMouseUp={(e) => {
        if (
          mouseDownTargetRef.current === e.currentTarget &&
          e.target === e.currentTarget
        ) {
          onClose();
        }
        mouseDownTargetRef.current = null;
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        {...(ariaLabelledBy
          ? { "aria-labelledby": ariaLabelledBy }
          : { "aria-label": ariaLabel ?? title })}
        {...(ariaDescribedBy ? { "aria-describedby": ariaDescribedBy } : {})}
        style={cardStyle}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key !== "Tab") return;
          const card = cardRef.current;
          if (!card) return;
          const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement;
          if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
