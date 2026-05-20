import { NextRequest, NextResponse } from "next/server";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { ArchitectGenerateRequestSchema } from "@/lib/forms/swarmSchemas";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";
import { checkRateLimit } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Mappe une erreur engine vers une réponse HTTP propre.
 *
 * Même logique que `api/swarms/[id]` : tout 4xx engine est propagé tel quel
 * (422 prompt invalide côté engine, 401, 429…), le reste (5xx, réseau,
 * inconnu) → 502 (engine down / injoignable).
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

/**
 * POST /api/swarms/architect/generate
 *
 * Proxy BFF vers l'Architect Agent (engine Python). Reçoit un prompt en
 * langage naturel, renvoie `{ spec, rationale, warnings }`. La spec est de la
 * shape `SwarmInputRaw` — injectée dans le builder côté client (éditable, pas
 * de création auto).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ArchitectGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const ownerId = await requireOwnerId();

    const rateKey = `architect:${ownerId}`;
    const rl = checkRateLimit(rateKey);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfterSeconds: rl.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    const result = await swarmsClient.architectGenerate(
      parsed.data.prompt,
      ownerId,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return engineErrorResponse(err);
  }
}
