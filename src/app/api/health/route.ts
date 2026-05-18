import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const _startedAt = Date.now();

/**
 * GET /api/health
 *
 * Probe infra Railway/Vercel — réponse 200 sans auth, sans version applicative.
 * Expose uniquement : status + uptime (secondes).
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    uptime: Math.floor((Date.now() - _startedAt) / 1000),
  });
}
