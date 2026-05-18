import Link from "next/link";
import { redirect } from "next/navigation";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary } from "@/lib/crewai/types";
import { KickoffForm, type KickoffFormState } from "@/components/runs/KickoffForm";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { deriveViewModel } from "@/lib/crews/deriveViewModel";
import { AgentStatePanel } from "@/components/crews/AgentStatePanel";
import { DecisionCard } from "@/components/crews/DecisionCard";
import { AgentDiff } from "@/components/crews/AgentDiff";
import { DayTimeline } from "@/components/crews/DayTimeline";
import { ProductBets } from "@/components/crews/ProductBets";

const CREW_NAME = "chief-of-staff";
const ALLOWED_TRIGGERS = ["morning", "evening", "intraday", "on_demand", "webhook"] as const;
type Trigger = (typeof ALLOWED_TRIGGERS)[number];

async function triggerKickoff(
  _prevState: KickoffFormState,
  formData: FormData,
): Promise<KickoffFormState> {
  "use server";
  const raw = formData.get("trigger");
  const trigger: Trigger = (ALLOWED_TRIGGERS as readonly string[]).includes(String(raw))
    ? (raw as Trigger)
    : "on_demand";

  let kickoffId: string;
  try {
    const result = await crewaiClient.kickoff(CREW_NAME, { trigger });
    kickoffId = result.kickoff_id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start run" };
  }

  // redirect outside try/catch — Next.js redirect throws an internal NEXT_REDIRECT signal
  redirect(`/crews/${CREW_NAME}/runs/${kickoffId}`);
}

export const metadata = { title: "Daily Chief of Staff — myswarms" };
export const dynamic = "force-dynamic";

export default async function ChiefOfStaffPage() {
  let runs: RunSummary[] = [];
  let listError: string | null = null;
  try {
    runs = await crewaiClient.listRuns("chief-of-staff", 1);
  } catch (err) {
    listError = err instanceof Error ? err.message : "Failed to load runs";
  }

  const latestRun = runs[0] ?? null;
  const now = new Date();
  const vm = deriveViewModel(latestRun, now);

  // Format pour AgentStatePanel
  const lastRunAt = latestRun?.started_at
    ? new Date(latestRun.started_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Format pour AgentDiff
  const sinceLabel = lastRunAt ? `depuis ${lastRunAt}` : "—";
  const elapsed = latestRun?.finished_at && latestRun?.started_at
    ? `${Math.round((new Date(latestRun.finished_at).getTime() - new Date(latestRun.started_at).getTime()) / 60_000)} min`
    : "—";

  return (
    <main>
      <AutoRefresh active={latestRun?.status === "running"} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <Link href="/crews" className="ct-breadcrumb-link">← Crews</Link>
          <h1 className="ct-title" style={{ marginTop: 4 }}>Daily Chief of Staff</h1>
          <p className="ct-sub">Inbox triage · classification · prioritization · drafts · daily summary</p>
          <Link href="/crews/chief-of-staff/history" className="ct-link" style={{ fontSize: 12 }}>
            Voir l&apos;historique des runs →
          </Link>
        </div>
        <KickoffForm action={triggerKickoff} />
      </div>

      {listError && (
        <div className="ct-card" style={{ borderColor: "rgba(225,29,72,0.55)", background: "rgba(225,29,72,0.08)", color: "#ff9eae", marginBottom: 16 }}>
          {listError}
        </div>
      )}

      {/* Scoped teal accent tokens */}
      <div style={{
        "--cos-accent": "#7cf2c4",
        "--cos-accent-soft": "rgba(124,242,196,0.1)",
        "--cos-accent-border": "rgba(124,242,196,0.25)",
        "--cos-p0": "#ff5e7a",
        "--cos-warn": "#ffb454",
        "--cos-info": "#6ea8ff",
      } as React.CSSProperties}>

        {/* 3-column home grid */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 200px", gap: 12, alignItems: "start" }}>
          <AgentStatePanel
            agentRows={vm.agentRows}
            runStats={vm.runStats}
            lastRunAt={lastRunAt}
            runStatus={latestRun?.status ?? null}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <DecisionCard
              p0Item={vm.p0Item}
              draftText={vm.draftText}
              runId={latestRun?.kickoff_id ?? null}
            />
            <DayTimeline markers={vm.timelineMarkers} />
          </div>

          <AgentDiff
            items={vm.diffItems}
            sinceLabel={sinceLabel}
            elapsed={elapsed}
          />
        </div>

        {/* Product bets */}
        <div style={{ marginTop: 32 }}>
          <div className="ct-eyebrow" style={{ marginBottom: 16 }}>3 paris produit</div>
          <ProductBets />
        </div>

      </div>
    </main>
  );
}
