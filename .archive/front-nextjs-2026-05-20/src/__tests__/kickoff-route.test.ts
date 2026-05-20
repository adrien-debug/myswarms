/**
 * Test 1 — API kickoff + error mapping
 *
 * Tests the route handler at src/app/api/swarms/[id]/kickoff/route.ts.
 * Mocks: swarmsClient, SwarmEngineError, getOwnerId.
 * No real network, no Supabase, no LLM.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mock state — must be hoisted before vi.mock() factories ─────────
// vi.hoisted() runs before the module graph is resolved, so these refs are
// safe to use inside vi.mock() factories without TDZ issues.
const { mockKickoff, mockGetOwnerId, mockRequireOwnerId } = vi.hoisted(() => ({
  mockKickoff: vi.fn(),
  mockGetOwnerId: vi.fn(),
  mockRequireOwnerId: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/crewai/swarms", () => {
  class SwarmEngineError extends Error {
    readonly status: number;
    readonly path: string;
    constructor(status: number, path: string, message: string) {
      super(message);
      this.name = "SwarmEngineError";
      this.status = status;
      this.path = path;
    }
  }
  return {
    SwarmEngineError,
    swarmsClient: { kickoff: mockKickoff },
  };
});

vi.mock("@/lib/auth/owner", () => ({
  getOwnerId: mockGetOwnerId,
  requireOwnerId: mockRequireOwnerId,
  OwnerAuthError: class OwnerAuthError extends Error {},
}));

// Import AFTER mocks are registered
import { POST } from "@/app/api/swarms/[id]/kickoff/route";
import { SwarmEngineError } from "@/lib/crewai/swarms";

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUID = "not-a-uuid";

function makeRequest(body: unknown): NextRequest {
  const serialized = JSON.stringify(body);
  return new NextRequest("http://localhost/api/swarms/test/kickoff", {
    method: "POST",
    body: serialized,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(serialized, "utf8")),
    },
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/swarms/[id]/kickoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOwnerId.mockResolvedValue("owner-abc");
    mockRequireOwnerId.mockResolvedValue("owner-abc");
  });

  it("returns 400 when swarm id is not a valid UUID", async () => {
    const req = makeRequest({ trigger: "on_demand" });
    const res = await POST(req, makeContext(INVALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid swarm id/i);
  });

  it("returns 400 when the JSON body is unparseable", async () => {
    const rawBody = "NOT JSON";
    const req = new NextRequest("http://localhost/api/swarms/test/kickoff", {
      method: "POST",
      body: rawBody,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(rawBody, "utf8")),
      },
    });
    const res = await POST(req, makeContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when request body fails Zod validation (missing trigger)", async () => {
    // trigger is required (SwarmTriggerSchema enum) — omitting it triggers Zod validation failure
    const req = makeRequest({});
    const res = await POST(req, makeContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
  });

  it("returns 202 on successful kickoff", async () => {
    mockKickoff.mockResolvedValue({ run_id: "run-uuid-1234567890123456" });
    const req = makeRequest({ trigger: "on_demand" });
    const res = await POST(req, makeContext(VALID_UUID));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.run_id).toBe("run-uuid-1234567890123456");
  });

  it("propagates engine 4xx status directly", async () => {
    mockKickoff.mockRejectedValue(
      new SwarmEngineError(404, "/v1/swarms/test/kickoff", "Swarm not found"),
    );
    const req = makeRequest({ trigger: "on_demand" });
    const res = await POST(req, makeContext(VALID_UUID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Swarm not found");
  });

  it("returns 502 when engine throws a 5xx SwarmEngineError", async () => {
    mockKickoff.mockRejectedValue(
      new SwarmEngineError(503, "/v1/swarms/test/kickoff", "Service unavailable"),
    );
    const req = makeRequest({ trigger: "on_demand" });
    const res = await POST(req, makeContext(VALID_UUID));
    expect(res.status).toBe(502);
  });

  it("returns 502 on unknown network error", async () => {
    mockKickoff.mockRejectedValue(new Error("fetch failed"));
    const req = makeRequest({ trigger: "on_demand" });
    const res = await POST(req, makeContext(VALID_UUID));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("fetch failed");
  });
});
