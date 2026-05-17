import Link from "next/link";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { FONT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

// H6 : taille des "TEMPLATE" badge labels — plus petit que FONT.xs pour
// rester discret. Cas spécifique, pas dans FONT.
const BADGE_FONT_SIZE = 10;

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
        <div className="ct-card-title">Erreur</div>
        <p className="ct-card-body">{error}</p>
      </div>
    );
  }

  if (swarms.length === 0) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">Aucun swarm</div>
        <p className="ct-card-body">
          Crée ton premier swarm pour démarrer.{" "}
          <Link href="/swarms/new" style={{ color: "var(--ct-accent-strong)" }}>
            Nouveau swarm →
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
            <th style={thStyle}>Nom</th>
            <th style={thStyle}>Agents</th>
            <th style={thStyle}>Dernière run</th>
            <th style={thStyle}>Statut</th>
            <th style={thStyle}>MAJ</th>
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
                  style={{
                    color: "var(--ct-text-strong)",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {s.name}
                </Link>
                {s.is_template ? (
                  <span
                    style={{
                      marginLeft: SPACING.sm,
                      fontSize: BADGE_FONT_SIZE,
                      padding: `${SPACING.xs / 2}px ${SPACING.xs + 2}px`,
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
                  Éditer
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// H6 : padding spécifique aux cellules table — pas dans SPACING (combinaison
// dédiée pour table compacte).
const TH_PADDING = `${SPACING.md}px ${SPACING.lg + 4}px`;
const TD_PADDING = `${SPACING.md + 2}px ${SPACING.lg + 4}px`;

const thStyle: React.CSSProperties = {
  padding: TH_PADDING,
  fontSize: BADGE_FONT_SIZE,
  fontWeight: 700,
  letterSpacing: LETTER_SPACING.wide,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: TD_PADDING,
  color: "var(--ct-text-body)",
};
