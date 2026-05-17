import { NextRequest, NextResponse } from "next/server";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { SwarmKickoffRequestSchema } from "@/lib/forms/swarmSchemas";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid swarm id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SwarmKickoffRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ownerId = await getOwnerId();
    const result = await swarmsClient.kickoff(id, parsed.data, ownerId);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
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
