import Link from "next/link";
import { redirect } from "next/navigation";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary } from "@/lib/crewai/types";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { KickoffForm, type KickoffFormState } from "@/components/runs/KickoffForm";

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
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/crews" className="text-sm text-neutral-500 hover:underline">
            ← Crews
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Daily Chief of Staff</h1>
          <p className="text-sm text-neutral-600">
            Inbox triage · classification · prioritization · drafts · daily summary
          </p>
        </div>
        <KickoffForm action={triggerKickoff} />
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Recent runs
        </h2>
        {listError ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {listError}
          </p>
        ) : runs.length === 0 ? (
          <p className="rounded-md border border-neutral-200 p-4 text-sm text-neutral-500">
            No runs yet. Trigger one above to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Kickoff ID</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {runs.map((r) => (
                  <tr key={r.kickoff_id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/crews/${CREW_NAME}/runs/${r.kickoff_id}`}
                        prefetch={false}
                        className="text-blue-600 hover:underline"
                      >
                        {r.kickoff_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3">{r.trigger}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {formatDate(r.started_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {r.finished_at ? formatDate(r.finished_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
