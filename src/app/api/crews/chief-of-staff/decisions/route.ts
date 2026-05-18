import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { checkBodySize } from "@/lib/utils/body-limit";

export const dynamic = "force-dynamic";

const DecisionRequestSchema = z.object({
  kickoff_id: z.string().uuid(),
  action: z.enum(["sent", "snoozed", "rejected"]),
  snooze_hours: z.number().int().positive().optional(),
});

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
      { status: 400 }
    );
  }

  try {
    const decision = await crewaiClient.recordDecision(
      "chief-of-staff",
      parsed.data
    );
    return NextResponse.json(decision, { status: 201 });
  } catch (err) {
    if (err instanceof CrewaiEngineError) {
      // Propage tout 4xx tel quel.
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
