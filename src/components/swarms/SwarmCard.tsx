import Link from "next/link";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { FONT, SPACING } from "@/lib/ui/tokens";

interface SwarmCardProps {
  swarm: SwarmListItem;
}

/**
 * Carte récap pour un swarm. Réutilise .ct-card du cockpit.
 */
export function SwarmCard({ swarm }: SwarmCardProps) {
  return (
    <Link
      href={`/swarms/${swarm.id}`}
      className="ct-card"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div className="ct-card-title">
        {swarm.is_template ? "Template" : "Swarm"}
        {" · "}
        v{swarm.version}
      </div>
      <div
        style={{
          fontSize: FONT.lg,
          fontWeight: 600,
          color: "var(--ct-text-strong)",
          marginBottom: SPACING.xs,
        }}
      >
        {swarm.name}
      </div>
      {swarm.description ? (
        <p
          className="ct-card-body"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            marginBottom: SPACING.md,
          }}
        >
          {swarm.description}
        </p>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.md,
          flexWrap: "wrap",
          fontSize: FONT.sm,
          color: "var(--ct-text-muted)",
        }}
      >
        <span>{swarm.agents_count} agents</span>
        <span>·</span>
        <span>{swarm.is_active ? "Active" : "Inactive"}</span>
        {swarm.last_run_status ? (
          <>
            <span>·</span>
            <StatusBadge status={swarm.last_run_status} />
          </>
        ) : null}
        {swarm.last_run_at ? (
          <>
            <span>·</span>
            <span>{formatDate(swarm.last_run_at)}</span>
          </>
        ) : null}
      </div>
    </Link>
  );
}
