import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Returns null if body size is acceptable, NextResponse 411/413 otherwise.
 *
 * - Reject with 411 Length Required if Content-Length is absent (forces
 *   clients to declare size — prevents bypass of the limit by omitting the
 *   header).
 * - Reject with 413 Payload Too Large if Content-Length > MAX_BODY_BYTES
 *   or is unparseable.
 */
export function checkBodySize(req: NextRequest): NextResponse | null {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) {
    return NextResponse.json(
      { error: "Content-Length header required" },
      { status: 411 },
    );
  }
  const size = parseInt(contentLength, 10);
  if (isNaN(size) || size > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  return null;
}
