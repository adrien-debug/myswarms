import { NextRequest, NextResponse } from "next/server";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { SwarmPatchSchema } from "@/lib/forms/swarmSchemas";
import { getOwnerId } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";
import { isValidUuid } from "@/lib/utils/uuid";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Mappe une erreur engine vers une réponse HTTP propre.
 *
 * Même logique que `api/crews/chief-of-staff/kickoff` : tout 4xx engine est
 * propagé tel quel (404, 401, 409, 429…), le reste (5xx, réseau, inconnu) → 502.
 */
function engineErrorResponse(err: unknown): NextResponse {
  if (err instanceof SwarmEngineError) {
    if (err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid swarm id" }, { status: 400 });
  }
  try {
    const ownerId = await getOwnerId();
    const swarm = await swarmsClient.get(id, ownerId);
    return NextResponse.json(swarm);
  } catch (err) {
    return engineErrorResponse(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid swarm id" }, { status: 400 });
  }

  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // F2 fix : SwarmPatchSchema (sans `.default()`) + transform qui strip
  // les clés undefined → l'engine reçoit uniquement ce que le client a
  // explicitement envoyé. Pas de re-set destructeur sur agents/tasks/bindings.
  const parsed = SwarmPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ownerId = await getOwnerId();
    const swarm = await swarmsClient.update(id, parsed.data, ownerId);
    return NextResponse.json(swarm);
  } catch (err) {
    return engineErrorResponse(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid swarm id" }, { status: 400 });
  }
  try {
    const ownerId = await getOwnerId();
    await swarmsClient.delete(id, ownerId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return engineErrorResponse(err);
  }
}
