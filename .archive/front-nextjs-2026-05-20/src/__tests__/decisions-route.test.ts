/**
 * Test suite — POST /api/crews/chief-of-staff/decisions
 *
 * Tests the route handler at src/app/api/crews/chief-of-staff/decisions/route.ts.
 * Mocks: crewaiClient, CrewaiEngineError.
 * No real network, no Supabase, no LLM.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockRecordDecision, mockRequireOwnerId } = vi.hoisted(() => ({
  mockRecordDecision: vi.fn(),
  mockRequireOwnerId: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/owner", () => ({
  requireOwnerId: mockRequireOwnerId,
  OwnerAuthError: class OwnerAuthError extends Error {},
}));

vi.mock("@/lib/crewai/client", () => {
  class CrewaiEngineError extends Error {
    readonly status: number;
    readonly path: string;
    constructor(status: number, path: string, message: string) {
      super(message);
      this.name = "CrewaiEngineError";
      this.status = status;
      this.path = path;
    }
  }
  return {
    CrewaiEngineError,
    crewaiClient: { recordDecision: mockRecordDecision },
  };
});

// Import AFTER mocks are registered
import { POST } from "@/app/api/crews/chief-of-staff/decisions/route";
import { CrewaiEngineError } from "@/lib/crewai/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(body: unknown): NextRequest {
  const serialized = JSON.stringify(body);
  return new NextRequest(
    "http://localhost/api/crews/chief-of-staff/decisions",
    {
      method: "POST",
      body: serialized,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(serialized, "utf8")),
      },
    },
  );
}

const MOCK_DECISION_RESPONSE = {
  id: "bb000000-0000-0000-0000-000000000001",
  action: "rejected" as const,
  snooze_until: null,
  created_at: "2026-05-18T09:00:00.000Z",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/crews/chief-of-staff/decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwnerId.mockResolvedValue("test-owner-id");
  });

  it("valid 'rejected' body → calls crewaiClient.recordDecision with correct args → 201", async () => {
    mockRecordDecision.mockResolvedValue(MOCK_DECISION_RESPONSE);

    const req = makeRequest({ kickoff_id: VALID_UUID, action: "rejected" });
    const res = await POST(req);

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.action).toBe("rejected");

    expect(mockRecordDecision).toHaveBeenCalledOnce();
    expect(mockRecordDecision).toHaveBeenCalledWith(
      "chief-of-staff",
      { kickoff_id: VALID_UUID, action: "rejected" },
      { ownerId: "test-owner-id" },
    );
  });

  it("valid 'snoozed' body with snooze_hours → 201", async () => {
    const snoozedDecision = {
      ...MOCK_DECISION_RESPONSE,
      action: "snoozed" as const,
      snooze_until: "2026-05-18T11:00:00.000Z",
    };
    mockRecordDecision.mockResolvedValue(snoozedDecision);

    const req = makeRequest({
      kickoff_id: VALID_UUID,
      action: "snoozed",
      snooze_hours: 2,
    });
    const res = await POST(req);

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.action).toBe("snoozed");

    expect(mockRecordDecision).toHaveBeenCalledWith(
      "chief-of-staff",
      { kickoff_id: VALID_UUID, action: "snoozed", snooze_hours: 2 },
      { ownerId: "test-owner-id" },
    );
  });

  it("invalid action (not in enum) → 400 validation error", async () => {
    const req = makeRequest({
      kickoff_id: VALID_UUID,
      action: "dismissed", // not a valid DecisionAction
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("invalid kickoff_id (not UUID) → 400 validation error", async () => {
    const req = makeRequest({
      kickoff_id: "not-a-uuid",
      action: "rejected",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("crewaiClient.recordDecision throws CrewaiEngineError(status=422) → 422 response", async () => {
    mockRecordDecision.mockRejectedValue(
      new CrewaiEngineError(
        422,
        "/v1/crews/chief-of-staff/decisions",
        "Unprocessable entity",
      ),
    );

    const req = makeRequest({ kickoff_id: VALID_UUID, action: "rejected" });
    const res = await POST(req);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Unprocessable entity");
  });

  it("crewaiClient.recordDecision throws CrewaiEngineError(status=500) → 502 response", async () => {
    mockRecordDecision.mockRejectedValue(
      new CrewaiEngineError(
        500,
        "/v1/crews/chief-of-staff/decisions",
        "Internal server error",
      ),
    );

    const req = makeRequest({ kickoff_id: VALID_UUID, action: "rejected" });
    const res = await POST(req);

    expect(res.status).toBe(502);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("unparseable JSON body → 400", async () => {
    const rawBody = "NOT JSON";
    const req = new NextRequest(
      "http://localhost/api/crews/chief-of-staff/decisions",
      {
        method: "POST",
        body: rawBody,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(rawBody, "utf8")),
        },
      },
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("missing action field → 400 validation error", async () => {
    const req = makeRequest({ kickoff_id: VALID_UUID });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("snooze_hours zero (0 = pas de snooze) → 201", async () => {
    const snoozedDecision = {
      ...MOCK_DECISION_RESPONSE,
      action: "snoozed" as const,
      snooze_until: null,
    };
    mockRecordDecision.mockResolvedValue(snoozedDecision);

    const req = makeRequest({
      kickoff_id: VALID_UUID,
      action: "snoozed",
      snooze_hours: 0,
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockRecordDecision).toHaveBeenCalledWith(
      "chief-of-staff",
      { kickoff_id: VALID_UUID, action: "snoozed", snooze_hours: 0 },
      { ownerId: "test-owner-id" },
    );
  });

  it("unknown Error (not CrewaiEngineError) → 502 with error message", async () => {
    mockRecordDecision.mockRejectedValue(new Error("Network timeout"));

    const req = makeRequest({ kickoff_id: VALID_UUID, action: "sent" });
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Network timeout");
  });

  it("valid 'sent' action → 201", async () => {
    const sentDecision = { ...MOCK_DECISION_RESPONSE, action: "sent" as const };
    mockRecordDecision.mockResolvedValue(sentDecision);

    const req = makeRequest({ kickoff_id: VALID_UUID, action: "sent" });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.action).toBe("sent");
  });
});
