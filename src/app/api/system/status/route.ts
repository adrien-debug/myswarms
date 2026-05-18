import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const engineUrl = process.env.CREWAI_ENGINE_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${engineUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const up = res.ok;
    return NextResponse.json({ engine: up ? "up" : "down" });
  } catch {
    return NextResponse.json({ engine: "down" });
  }
}
