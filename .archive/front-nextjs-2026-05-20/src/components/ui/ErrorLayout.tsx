import type { ReactNode } from "react";

interface ErrorLayoutProps {
  title: string;
  message?: string;
  children?: ReactNode;
}

export function ErrorLayout({ title, message, children }: ErrorLayoutProps) {
  return (
    <section role="alert">
      <h1 className="ct-title">{title}</h1>
      {message ? (
        <p className="ct-card-body" style={{ color: "var(--ct-text-muted)" }}>
          {message}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export default ErrorLayout;
