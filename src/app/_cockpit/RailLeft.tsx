"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FONT, SPACING } from "@/lib/ui/tokens";

const NAV_BTN_SIZE = 40;
const NAV_BTN_RADIUS = 10;

interface NavEntry {
  href: string;
  label: string;
  icon: string;
  disabled?: boolean;
}

const NAV: NavEntry[] = [
  { href: "/", label: "Cockpit", icon: "◉" },
  { href: "/swarms", label: "Swarms", icon: "✦" },
  { href: "/crews", label: "Crews", icon: "⊙" },
  { href: "/tools", label: "Tools", icon: "▣", disabled: true },
];

export function RailLeft() {
  const pathname = usePathname();

  return (
    <aside className="ct-rail-left">
      <Link href="/" className="ct-logo-slot" aria-label="Accueil">
        <div className="ct-logo-dot"></div>
      </Link>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: SPACING.sm,
          marginTop: SPACING.sm,
        }}
      >
        {NAV.map((entry) => {
          const isActive =
            entry.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(entry.href);

          const baseStyle: React.CSSProperties = {
            width: NAV_BTN_SIZE,
            height: NAV_BTN_SIZE,
            borderRadius: NAV_BTN_RADIUS,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: FONT.lg,
            textDecoration: "none",
            background: isActive ? "var(--ct-accent-soft)" : "transparent",
            color: isActive
              ? "var(--ct-text-strong)"
              : entry.disabled
                ? "var(--ct-text-faint)"
                : "var(--ct-text-muted)",
            border: isActive
              ? "1px solid var(--ct-border-accent)"
              : "1px solid transparent",
            cursor: entry.disabled ? "not-allowed" : "pointer",
            transition: "background var(--ct-dur-base) var(--ct-ease)",
          };

          if (entry.disabled) {
            return (
              <span
                key={entry.href}
                style={baseStyle}
                title={`${entry.label} (à venir)`}
                aria-disabled
              >
                {entry.icon}
              </span>
            );
          }
          return (
            <Link
              key={entry.href}
              href={entry.href}
              style={baseStyle}
              title={entry.label}
              aria-label={entry.label}
            >
              {entry.icon}
            </Link>
          );
        })}
      </nav>

      <div className="ct-spacer"></div>
      <div className="ct-avatar">AB</div>
    </aside>
  );
}
