import { NextRequest, NextResponse } from "next/server";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; runId: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id, runId } = await params;
  if (!isValidUuid(id) || !isValidUuid(runId)) {
    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  }
  try {
    const ownerId = await requireOwnerId();
    const run = await swarmsClient.status(id, runId, ownerId);
    return NextResponse.json(run);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof SwarmEngineError) {
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
