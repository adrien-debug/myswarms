import Link from "next/link";
import { swarmsClient } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { SwarmCard } from "@/components/swarms/SwarmCard";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ChiefBriefWidget } from "@/components/crews/ChiefBriefWidget";
import { SPACING } from "@/lib/ui/tokens";

export const dynamic = "force-dynamic";

const RECENT_SWARMS_LIMIT = 6;

export default async function Home() {
  let swarms: SwarmListItem[] = [];
  let engineError: string | null = null;
  try {
    const ownerId = await getOwnerId();
    swarms = await swarmsClient.list(ownerId);
  } catch (err) {
    engineError = err instanceof Error ? err.message : "Failed to load swarms";
  }

  const totalSwarms = swarms.length;
  const activeSwarms = swarms.filter((s) => s.is_active).length;
  const activeRuns = swarms.filter((s) => s.last_run_status === "running").length;
  const recent = [...swarms]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, RECENT_SWARMS_LIMIT);

  return (
    <>
      <div className="ct-eyebrow">Cockpit · MySwarms</div>
      <h1 className="ct-title">Bienvenue</h1>
      <p className="ct-sub">
        Vue d&apos;ensemble de tes swarms et de leurs runs récents.
      </p>

      <KPIDashboard
        kpis={[
          { label: "Total swarms", value: totalSwarms, accent: true },
          { label: "Active", value: activeSwarms },
          { label: "Active runs", value: activeRuns },
          { label: "Engine", value: engineError ? "down" : "ok" },
        ]}
      />

      {engineError ? (
        <div
          className="ct-card"
          style={{ borderColor: "var(--ct-border-accent)" }}
        >
          <div className="ct-card-title">Engine indisponible</div>
          <p className="ct-card-body">{engineError}</p>
        </div>
      ) : null}

      <div className="ct-eyebrow" style={{ marginTop: 8 }}>Chief of Staff</div>
      <ChiefBriefWidget />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: SPACING.lg,
        }}
      >
        <SectionLabel text="Swarms récents" />
        <Link href="/swarms" className="ct-seg-btn">
          Voir tout
        </Link>
      </div>

      {recent.length === 0 && !engineError ? (
        <div className="ct-card">
          <div className="ct-card-title">Démarre</div>
          <p className="ct-card-body">
            Pas encore de swarm.{" "}
            <Link href="/swarms/new" className="ct-link">
              Crée ton premier swarm →
            </Link>
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            // 260px : largeur minimale de card pour afficher nom + status sans troncature
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: SPACING.lg,
            marginBottom: SPACING.xl,
          }}
        >
          {recent.map((s) => (
            <SwarmCard key={s.id} swarm={s} />
          ))}
        </div>
      )}

      <div className="ct-card">
        <div className="ct-card-title">Quick actions</div>
        <div
          style={{
            display: "flex",
            gap: SPACING.sm,
            flexWrap: "wrap",
          }}
        >
          <Link href="/swarms/new" className="ct-seg-btn primary">
            + Nouveau swarm
          </Link>
          <Link href="/swarms" className="ct-seg-btn">
            Tous les swarms
          </Link>
          <Link href="/crews/chief-of-staff" className="ct-seg-btn">
            Crew historique (Chief of Staff)
          </Link>
        </div>
      </div>
    </>
  );
}
