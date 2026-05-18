import Link from "next/link";
import { redirect } from "next/navigation";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary, RunStep, Decision } from "@/lib/crewai/types";
import { KickoffForm, type KickoffFormState } from "@/components/runs/KickoffForm";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { deriveViewModel } from "@/lib/crews/deriveViewModel";
import { AgentStatePanel } from "@/components/crews/AgentStatePanel";
import { DecisionCard } from "@/components/crews/DecisionCard";
import { AgentDiff } from "@/components/crews/AgentDiff";
import { DayTimeline } from "@/components/crews/DayTimeline";
import { ProductBets } from "@/components/crews/ProductBets";
import { SPACING, FONT } from "@/lib/ui/tokens";
import { requireOwnerId } from "@/lib/auth/owner";

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
      partialDataError = err instanceof Error ? err.message : "Données partielles indisponibles";
    }
  }
  const vm = deriveViewModel(latestRun, steps, decisions, now);

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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SPACING.xl }}>
        <div>
          <h1 className="ct-title" style={{ marginTop: SPACING.xs }}>Daily Chief of Staff</h1>
          <p className="ct-sub">Inbox triage · classification · prioritization · drafts · daily summary</p>
          <Link href="/crews/chief-of-staff/history" className="ct-link" style={{ fontSize: FONT.sm }}>
            Voir l&apos;historique des runs →
          </Link>
        </div>
        <KickoffForm action={triggerKickoff} />
      </div>

      {listError && (
        <div
          className="ct-card"
          style={{
            borderColor: "var(--ct-alert-error-border)",
            background: "var(--ct-alert-error-bg)",
            color: "var(--ct-alert-error-text)",
            marginBottom: SPACING.lg,
          }}
        >
          {listError}
        </div>
      )}

      {/* Bandeau données partielles — distinct de l'état "aucune donnée" */}
      {partialDataError && (
        <div
          className="ct-card"
          style={{
            borderColor: "var(--ct-alert-error-border)",
            background: "var(--ct-alert-error-bg)",
            color: "var(--ct-alert-error-text)",
            marginBottom: SPACING.lg,
          }}
        >
          Données partielles — étapes indisponibles
          {partialDataError ? ` (${partialDataError})` : ""}
        </div>
      )}

      {/* --cos-* tokens définis dans :root cockpit.css — pas besoin de style inline */}
      <div>

        {/* 3-column home grid */}
        <div style={{ display: "grid", gridTemplateColumns: "var(--ct-rail-width) 1fr var(--ct-rail-width)", gap: SPACING.md, alignItems: "start" }}>
          <AgentStatePanel
            agentRows={vm.agentRows}
            runStats={vm.runStats}
            lastRunAt={lastRunAt}
            runStatus={latestRun?.status ?? null}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}>
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
        <div style={{ marginTop: SPACING.xxl }}>
          <div className="ct-eyebrow" style={{ marginBottom: SPACING.lg }}>3 paris produit</div>
          <ProductBets />
        </div>

      </div>
    </main>
  );
}
