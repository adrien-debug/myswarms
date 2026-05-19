"use client";

import type { CSSProperties, ReactNode } from "react";

interface CtButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
}

export function CtButton({
  variant,
  loading = false,
  type = "button",
  disabled = false,
  onClick,
  className,
  style,
  children,
  "aria-label": ariaLabel,
  title,
}: CtButtonProps) {
  const cls = [
    "ct-seg-btn",
    variant === "primary" ? "primary" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={cls}
      disabled={loading || disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      title={title}
      style={style}
    >
      {children}
      {loading && <span aria-hidden="true" style={{ marginLeft: "0.35em" }}>…</span>}
    </button>
  );
}

export default CtButton;
