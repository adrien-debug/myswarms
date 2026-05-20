import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";

export const dynamic = "force-dynamic";

const DecisionRequestSchema = z.object({
  kickoff_id: z.string().uuid(),
  action: z.enum(["sent", "snoozed", "rejected"]),
  snooze_hours: z.number().int().nonnegative().optional(),
});

const uuidSchema = z.string().uuid();

/**
 * GET /api/crews/chief-of-staff/decisions?kickoffId=<uuid>
 * Liste les décisions d'un run, scopées par owner_id.
 *
 * POST /api/crews/chief-of-staff/decisions
 * Enregistre une décision (record), scopée par owner_id.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const kickoffId = req.nextUrl.searchParams.get("kickoffId") ?? "";
  if (!kickoffId) {
    return NextResponse.json({ error: "Missing kickoffId query param" }, { status: 400 });
  }
  if (!uuidSchema.safeParse(kickoffId).success) {
    return NextResponse.json({ error: "Invalid kickoffId (expected UUID)" }, { status: 400 });
  }

  try {
    const ownerId = await requireOwnerId();
    const decisions = await crewaiClient.listDecisions("chief-of-staff", kickoffId, { ownerId });
    return NextResponse.json(decisions);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof CrewaiEngineError) {
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
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

  const parsed = DecisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ownerId = await requireOwnerId();
    const decision = await crewaiClient.recordDecision(
      "chief-of-staff",
      parsed.data,
      { ownerId },
    );
    return NextResponse.json(decision, { status: 201 });
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof CrewaiEngineError) {
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
