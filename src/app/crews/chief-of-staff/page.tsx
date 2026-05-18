import Link from "next/link";
import { redirect } from "next/navigation";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary } from "@/lib/crewai/types";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { KickoffForm, type KickoffFormState } from "@/components/runs/KickoffForm";
import { ChiefBriefWidget } from "@/components/crews/ChiefBriefWidget";

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
    runs = await crewaiClient.listRuns(CREW_NAME, 20);
  } catch (err) {
    listError = err instanceof Error ? err.message : "Failed to load runs";
  }

  return (
    <>
      <Link href="/crews" className="ct-breadcrumb-link" style={{ fontSize: 13 }}>
        ← Crews
      </Link>

      <div style={{ marginTop: 8, marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="ct-title" style={{ marginBottom: 4 }}>Daily Chief of Staff</h1>
          <p className="ct-sub" style={{ marginBottom: 0 }}>
            Inbox triage · classification · prioritization · drafts · daily summary
          </p>
        </div>
        <KickoffForm action={triggerKickoff} />
      </div>

      <ChiefBriefWidget compact={true} />

      <section style={{ marginTop: 24 }}>
        <div className="ct-eyebrow">Runs récents</div>

        {listError ? (
          <div
            className="ct-card"
            style={{
              border: "1px solid rgba(225,29,72,0.55)",
              background: "rgba(225,29,72,0.08)",
            }}
          >
            <p className="ct-card-body" style={{ color: "var(--ct-alert-error-text)" }}>
              {listError}
            </p>
          </div>
        ) : runs.length === 0 ? (
          <div className="ct-card">
            <p className="ct-card-body">
              Aucun run pour l&apos;instant. Déclenche un brief ci-dessus.
            </p>
          </div>
        ) : (
          <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="ct-table">
              <thead>
                <tr>
                  <th className="ct-th">Kickoff ID</th>
                  <th className="ct-th">Trigger</th>
                  <th className="ct-th">Status</th>
                  <th className="ct-th">Démarré</th>
                  <th className="ct-th">Terminé</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.kickoff_id} className="ct-tr">
                    <td className="ct-td" style={{ fontFamily: "monospace", fontSize: 11 }}>
                      <Link
                        href={`/crews/${CREW_NAME}/runs/${r.kickoff_id}`}
                        prefetch={false}
                        className="ct-link"
                      >
                        {r.kickoff_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="ct-td">{r.trigger}</td>
                    <td className="ct-td">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="ct-td" style={{ fontSize: 11 }}>
                      {formatDate(r.started_at)}
                    </td>
                    <td className="ct-td" style={{ fontSize: 11 }}>
                      {r.finished_at ? formatDate(r.finished_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
