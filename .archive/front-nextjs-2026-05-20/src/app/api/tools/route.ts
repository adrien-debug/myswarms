import { NextResponse } from "next/server";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";

export const dynamic = "force-dynamic";

/**
 * GET /api/tools — proxy vers engine GET /v1/tools.
 * Si l'engine n'expose pas encore l'endpoint, on retourne [] silencieusement
 * pour ne pas casser le ToolPicker (frontend stub-friendly).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ownerId = await requireOwnerId();
    const tools = await swarmsClient.listTools(ownerId);
    return NextResponse.json(tools);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Endpoint pas encore branché côté engine → fallback liste vide
    if (err instanceof SwarmEngineError && err.status === 404) {
      return NextResponse.json([]);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
