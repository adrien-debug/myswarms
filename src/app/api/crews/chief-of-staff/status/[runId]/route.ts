import { NextRequest, NextResponse } from "next/server";
import { crewaiClient } from "@/lib/crewai/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<NextResponse> {
  const { runId } = await params;

  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  }

  try {
    const result = await crewaiClient.status("chief-of-staff", runId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
