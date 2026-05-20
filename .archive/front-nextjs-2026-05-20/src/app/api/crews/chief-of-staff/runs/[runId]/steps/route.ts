import { NextRequest, NextResponse } from "next/server";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { isValidUuidV4 } from "@/lib/utils/uuid";

export const dynamic = "force-dynamic";

/**
 * GET /api/crews/chief-of-staff/runs/[runId]/steps
 * Liste les steps d'un run, scopés par owner_id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  const { runId } = await params;

  if (!runId || !isValidUuidV4(runId)) {
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
  }

  try {
    const ownerId = await requireOwnerId();
    const steps = await crewaiClient.listSteps("chief-of-staff", runId, { ownerId });
    return NextResponse.json(steps);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof CrewaiEngineError) {
      if (err.status === 404) return NextResponse.json([]);
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
