import { NextRequest, NextResponse } from "next/server";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { isValidUuidV4 } from "@/lib/utils/uuid";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<NextResponse> {
  const { runId } = await params;

  if (!runId || !isValidUuidV4(runId)) {
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
  }

  try {
    const ownerId = await requireOwnerId();
    const result = await crewaiClient.status("chief-of-staff", runId, { ownerId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof CrewaiEngineError) {
      // Propage tout 4xx (auth, validation, conflit, rate limit, etc.) tel quel.
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      // 5xx ou inconnu → 502 Bad Gateway
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
