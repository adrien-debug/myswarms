import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/system/status
 *
 * Retourne l'état du système (engine CrewAI reachable ou non).
 * Ne fuite aucun secret ni URL interne — uniquement le statut de connectivité.
 */
export async function GET(): Promise<NextResponse> {
  const engineUrl = process.env.CREWAI_ENGINE_URL ?? "http://localhost:8000";

  let engineStatus: "ok" | "unreachable" = "unreachable";
  try {
    const res = await fetch(`${engineUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      engineStatus = "ok";
    }
  } catch {
    // engine non joignable — pas de fuite d'URL interne dans la réponse
  }

  return NextResponse.json({
    engine: engineStatus,
  });
}
