import Link from "next/link";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";
import { Chevron } from "@/components/ui/Chevron";

// FONT.xs = 10 — taille exacte pour les badge labels TEMPLATE.
const BADGE_FONT_SIZE = FONT.xs;

interface SwarmListProps {
  swarms: SwarmListItem[];
  error?: string | null;
}

/**
 * Tableau de swarms. Conserve les vars cockpit (--ct-*).
 */
export function SwarmList({ swarms, error }: SwarmListProps) {
  if (error) {
    return (
      <div
        className="ct-card"
        style={{ borderColor: "var(--ct-border-accent)" }}
      >
        <div className="ct-card-title">Error</div>
        <p className="ct-card-body">{error}</p>
      </div>
    );
  }

  if (swarms.length === 0) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">No swarm</div>
        <p className="ct-card-body">
          Create your first swarm to get started.{" "}
          <Link href="/swarms/new" style={{ color: "var(--ct-accent-strong)" }}>
            New swarm <Chevron direction="right" />
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div
      className="ct-card"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.base }}>
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--ct-border)",
              textAlign: "left",
            }}
          >
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Agents</th>
            <th style={thStyle}>Last run</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Updated</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {swarms.map((s) => (
            <tr
              key={s.id}
              style={{ borderBottom: "1px solid var(--ct-border-soft)" }}
            >
              <td style={tdStyle}>
                <Link
                  href={`/swarms/${s.id}`}
                  className="ct-link"
                  style={{ fontWeight: FONT_WEIGHT.semibold }}
                >
                  {s.name}
                </Link>
                {s.is_template ? (
                  <span
                    style={{
                      marginLeft: SPACING.sm,
                      fontSize: BADGE_FONT_SIZE,
                      padding: `${SPACING.hair}px ${SPACING.xxs}px`,
                      borderRadius: RADIUS.sm,
                      background: "var(--ct-surface-3)",
                      color: "var(--ct-text-muted)",
                    }}
                  >
                    TEMPLATE
                  </span>
                ) : null}
              </td>
              <td style={tdStyle}>{s.agents_count}</td>
              <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                {s.last_run_at ? formatDate(s.last_run_at) : "—"}
              </td>
              <td style={tdStyle}>
                {s.last_run_status ? (
                  <StatusBadge status={s.last_run_status} />
                ) : (
                  <span style={{ color: "var(--ct-text-faint)" }}>—</span>
                )}
              </td>
              <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                {formatDate(s.updated_at)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                <Link
                  href={`/swarms/${s.id}/edit`}
                  style={{ color: "var(--ct-accent-strong)", fontSize: FONT.sm }}
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Padding table compacte : lx = 20 pour horizontal, md = 12 pour vertical TH,
// xxs = 6 additionnel pour TD (md+xxs = 18 ≈ entre md et lg — s utilisé comme proxy).
const TH_PADDING = `${SPACING.md}px ${SPACING.lx}px`;
const TD_PADDING = `${SPACING.s}px ${SPACING.lx}px`;

const thStyle: React.CSSProperties = {
  padding: TH_PADDING,
  fontSize: BADGE_FONT_SIZE,
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: LETTER_SPACING.wide,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: TD_PADDING,
  color: "var(--ct-text-body)",
};
