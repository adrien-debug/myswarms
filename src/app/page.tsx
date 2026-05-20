import "./dashboard.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { crewaiClient } from "@/lib/crewai/client";
import { swarmsClient } from "@/lib/crewai/swarms";
import type { RunSummary, RunStep, Decision } from "@/lib/crewai/types";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { KickoffForm, type KickoffFormState } from "@/components/runs/KickoffForm";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { deriveViewModel } from "@/lib/crews/deriveViewModel";
import { AgentStatePanel } from "@/components/crews/AgentStatePanel";
import { DecisionCard } from "@/components/crews/DecisionCard";
import { AgentDiff } from "@/components/crews/AgentDiff";
import { DayTimeline } from "@/components/crews/DayTimeline";
import { DashboardKPIs } from "@/components/dashboard/DashboardKPIs";
import { RunsSparkline } from "@/components/dashboard/RunsSparkline";
import { StorageBreakdown } from "@/components/dashboard/StorageBreakdown";
import { SuccessCircle } from "@/components/dashboard/SuccessCircle";
import { RunLogs } from "@/components/dashboard/RunLogs";
import { SwarmFleet } from "@/components/dashboard/SwarmFleet";
import { Chevron } from "@/components/ui/Chevron";
import { requireOwnerId } from "@/lib/auth/owner";
import { FONT } from "@/lib/ui/tokens";

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

export const metadata = { title: "MySwarms · Daily Chief of Staff" };
export const dynamic = "force-dynamic";

export default async function Home() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch {
    redirect("/login");
  }

  let runs: RunSummary[] = [];
  let listError: string | null = null;
  try {
    runs = await crewaiClient.listRuns("chief-of-staff", 1, { ownerId });
  } catch (err) {
    listError = err instanceof Error ? err.message : "Failed to load runs";
  }

  const latestRun = runs[0] ?? null;
  const now = new Date();

  let steps: RunStep[] = [];
  let decisions: Decision[] = [];
  let partialDataError: string | null = null;
  if (latestRun) {
    try {
      [steps, decisions] = await Promise.all([
        crewaiClient.listSteps("chief-of-staff", latestRun.kickoff_id, { ownerId }),
        crewaiClient.listDecisions("chief-of-staff", latestRun.kickoff_id, { ownerId }),
      ]);
    } catch (err) {
      partialDataError = err instanceof Error ? err.message : "Partial data unavailable";
    }
  }

  const vm = deriveViewModel(latestRun, steps, decisions, now);

  // Formatage pour AgentStatePanel
  const lastRunAt = latestRun?.started_at
    ? new Date(latestRun.started_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Formatage pour AgentDiff
  const sinceLabel = lastRunAt ? `since ${lastRunAt}` : "—";
  const elapsed = latestRun?.finished_at && latestRun?.started_at
    ? `${Math.round((new Date(latestRun.finished_at).getTime() - new Date(latestRun.started_at).getTime()) / 60_000)} min`
    : "—";

  // ── KPIs dérivés ────────────────────────────────────────────────────────────
  // TODO: runsToday — nécessite listRuns avec filtre date (API non dispo en V1)
  const runsToday = runs.length > 0 ? 1 : 0;

  const successRate =
    vm.runStats && vm.runStats.total > 0
      ? Math.round(
          ((vm.runStats.total - (vm.runStats.p0 > 0 ? 0 : 0)) / vm.runStats.total) * 100,
        )
      : latestRun?.status === "completed"
      ? 100
      : latestRun?.status === "failed"
      ? 0
      : 0;

  const activeAgents = vm.agentRows.filter((r) => r.status === "active").length;
  const p0Count = vm.runStats?.p0 ?? (vm.p0Item ? 1 : 0);

  // ── Sparkline 7J ────────────────────────────────────────────────────────────
  // TODO: remplacer par un vrai appel listRuns par jour quand l'API le supporte
  const sparklineValues: number[] = [0, 0, 0, 0, 0, 0, runs.length > 0 ? 1 : 0];

  // ── Cost segments placeholder ─────────────────────────────────────────────
  const costSegments = [
    { label: "Claude Sonnet", value: 4.2, color: "var(--ct-accent-strong)" },
    { label: "Kimi K2.6", value: 1.8, color: "var(--ct-accent-maroon)" },
  ];

  // ── Swarm Fleet ──────────────────────────────────────────────────────────
  let swarmList: SwarmListItem[] = [];
  try {
    swarmList = await swarmsClient.list(ownerId);
  } catch {
    // Silencieux — le widget affiche un CTA vide
  }

  const swarmFleet = swarmList.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.is_active,
  }));

  // ── Live logs dérivés des steps ───────────────────────────────────────────
  const recentSteps = steps.slice(-12).map((s) => ({
    time: s.started_at
      ? new Date(s.started_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : "—",
    agent: s.agent_name,
    action: s.finished_at ? "done" : "running",
  }));

  return (
    <main>
      <AutoRefresh active={latestRun?.status === "running"} />

      {/* Header — UN SEUL h1 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <span className="ct-eyebrow">Cockpit · MySwarms</span>
          <h1 className="ct-title">Orchestration Dashboard</h1>
          <p className="ct-sub">
            {lastRunAt ? `Last run · ${lastRunAt}` : "No recent run"}
          </p>
          <Link href="/crews/chief-of-staff/history" className="ct-link" style={{ fontSize: FONT.sm }}>
            View run history<Chevron direction="right" />
          </Link>
        </div>
        <KickoffForm action={triggerKickoff} />
      </div>

      {/* Alertes */}
      {listError && (
        <div
          className="ct-card"
          role="alert"
          style={{
            borderColor: "var(--ct-alert-error-border)",
            background: "var(--ct-alert-error-bg)",
            color: "var(--ct-alert-error-text)",
            marginBottom: 16,
          }}
        >
          {listError}
        </div>
      )}
      {partialDataError && (
        <div
          className="ct-card"
          role="alert"
          style={{
            borderColor: "var(--ct-alert-error-border)",
            background: "var(--ct-alert-error-bg)",
            color: "var(--ct-alert-error-text)",
            marginBottom: 16,
          }}
        >
          Partial data — steps unavailable{partialDataError ? ` (${partialDataError})` : ""}
        </div>
      )}

      {/* ── Bento grid ─────────────────────────────────────────────────────── */}
      <div className="bento">
        {/* KPIs — full width */}
        <section className="b-kpis">
          <DashboardKPIs
            runsToday={runsToday}
            successRate={successRate}
            activeAgents={activeAgents}
            p0Count={p0Count}
          />
        </section>

        {/* P0 HITL — colonne large */}
        <section className="b-p0">
          <DecisionCard
            p0Item={vm.p0Item}
            draftText={vm.draftText}
            runId={latestRun?.kickoff_id ?? null}
          />
        </section>

        {/* Live logs — colonne droite */}
        <section className="b-logs">
          <RunLogs steps={recentSteps} />
        </section>

        {/* Timeline — full width */}
        <section className="b-timeline">
          <DayTimeline markers={vm.timelineMarkers} />
        </section>

        {/* Agents */}
        <section className="b-agents">
          <AgentStatePanel
            agentRows={vm.agentRows}
            runStats={vm.runStats}
            lastRunAt={lastRunAt}
            runStatus={latestRun?.status ?? null}
          />
        </section>

        {/* Feed diff */}
        <section className="b-feed">
          <AgentDiff
            items={vm.diffItems}
            sinceLabel={sinceLabel}
            elapsed={elapsed}
          />
        </section>

        {/* Sparkline */}
        <section className="b-spark">
          <RunsSparkline values={sparklineValues} />
        </section>

        {/* Cost breakdown */}
        <section className="b-cost">
          <StorageBreakdown segments={costSegments} />
        </section>

        {/* Success rate */}
        <section className="b-success">
          <SuccessCircle percent={successRate} />
        </section>

        {/* Swarm fleet */}
        <section className="b-fleet">
          <SwarmFleet swarms={swarmFleet} />
        </section>
      </div>
    </main>
  );
}
