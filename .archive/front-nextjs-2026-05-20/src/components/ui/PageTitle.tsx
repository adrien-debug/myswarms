import type { CSSProperties, ReactNode } from "react";

interface PageTitleProps {
  variant?: "default" | "mono";
  children: ReactNode;
  style?: CSSProperties; // forwarded as-is to <h1>
}

export function PageTitle({ variant, children, style }: PageTitleProps) {
  const className =
    variant === "mono" ? "ct-title ct-title--mono" : "ct-title";

  return (
    <h1 className={className} style={style}>
      {children}
    </h1>
  );
}

export default PageTitle;
