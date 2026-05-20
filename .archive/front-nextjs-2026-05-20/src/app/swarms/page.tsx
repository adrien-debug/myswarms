import Link from "next/link";
import { swarmsClient } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { SwarmList } from "@/components/swarms/SwarmList";
import { SPACING } from "@/lib/ui/tokens";

export const metadata = { title: "Swarms — MySwarms" };
export const dynamic = "force-dynamic";

export default async function SwarmsPage() {
  let swarms: SwarmListItem[] = [];
  let listError: string | null = null;
  try {
    const ownerId = await getOwnerId();
    swarms = await swarmsClient.list(ownerId);
  } catch (err) {
    listError = err instanceof Error ? err.message : "Failed to load swarms";
  }

  const totalSwarms = swarms.length;
  const activeRuns = swarms.filter((s) => s.last_run_status === "running").length;
  // V1 : pas encore d'agrégat 30j depuis engine — tiret court en attendant (TODO V2)
  const runs30d = "—";
  const successRate = "—";

  return (
    <>
      <div className="ct-eyebrow">Cockpit · MySwarms</div>
      <h1 className="ct-title">Swarms</h1>
      <p className="ct-sub">
        Configure your multi-agent crews, trigger them on demand or via schedules.
      </p>

      <KPIDashboard
        kpis={[
          { label: "Total swarms", value: totalSwarms, accent: true },
          { label: "Active runs", value: activeRuns },
          { label: "Runs 30d", value: runs30d },
          { label: "Success rate", value: successRate },
        ]}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: SPACING.lg,
        }}
      >
        <div className="ct-eyebrow">
          All swarms
        </div>
        <Link href="/swarms/new" className="ct-seg-btn primary">
          + New swarm
        </Link>
      </div>

      <SwarmList swarms={swarms} error={listError} />
    </>
  );
}
