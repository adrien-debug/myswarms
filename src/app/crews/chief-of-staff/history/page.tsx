import Link from "next/link";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary } from "@/lib/crewai/types";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { FONT, SPACING } from "@/lib/ui/tokens";

const CREW_NAME = "chief-of-staff";

export const metadata = { title: "Historique des runs — Chief of Staff — myswarms" };
export const dynamic = "force-dynamic";

export default async function ChiefOfStaffHistoryPage() {
  let runs: RunSummary[] = [];
  let listError: string | null = null;
  try {
    runs = await crewaiClient.listRuns(CREW_NAME, 20);
  } catch (err) {
    listError = err instanceof Error ? err.message : "Failed to load runs";
  }

  return (
    <>
      <Link
        href="/"
        className="ct-breadcrumb-link"
        style={{ fontSize: FONT.base }}
      >
        ← Cockpit
      </Link>

      <div
        style={{
          marginTop: SPACING.sm,
          marginBottom: SPACING.xl,
        }}
      >
        <h1 className="ct-title" style={{ marginBottom: SPACING.xs }}>
          Historique des runs
        </h1>
        <p className="ct-sub" style={{ marginBottom: 0 }}>
          20 derniers runs du Daily Chief of Staff
        </p>
      </div>

      <section>
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
              Aucun run pour l&apos;instant. Déclenche un brief depuis la page principale.
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
                    <td className="ct-td" style={{ fontFamily: "monospace", fontSize: FONT.xs }}>
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
                    <td className="ct-td" style={{ fontSize: FONT.xs }}>
                      {formatDate(r.started_at)}
                    </td>
                    <td className="ct-td" style={{ fontSize: FONT.xs }}>
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
