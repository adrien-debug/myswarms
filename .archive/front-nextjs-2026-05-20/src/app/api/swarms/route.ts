import { NextRequest, NextResponse } from "next/server";
import { swarmsClient } from "@/lib/crewai/swarms";
import { SwarmInputSchema } from "@/lib/forms/swarmSchemas";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const ownerId = await requireOwnerId();
    const swarms = await swarmsClient.list(ownerId);
    return NextResponse.json(swarms);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SwarmInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ownerId = await requireOwnerId();
    const swarm = await swarmsClient.create(parsed.data, ownerId);
    return NextResponse.json(swarm, { status: 201 });
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
