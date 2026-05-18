import { NextRequest, NextResponse } from "next/server";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { CrewKickoffRequestSchema } from "@/lib/crewai/types";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = CrewKickoffRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const ownerId = await requireOwnerId();
    const result = await crewaiClient.kickoff(
      "chief-of-staff",
      parsed.data,
      { ownerId },
    );
    return NextResponse.json(result, { status: 202 });
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
