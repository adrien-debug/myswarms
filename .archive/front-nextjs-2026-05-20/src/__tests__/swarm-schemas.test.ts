/**
 * Test 3 — Round-trip schema Zod (swarmSchemas.ts)
 *
 * Validates that SwarmKickoffRequestSchema accepts/rejects correct payloads,
 * and that SwarmInputSchema enforces its required/optional fields.
 * This acts as the "round-trip" check: the Zod shape mirrors the Pydantic
 * models defined in services/crewai-engine/src/routes/swarms.py.
 *
 * No mocks needed — pure schema parsing, deterministic, no network.
 */
import { describe, it, expect } from "vitest";
import {
  SwarmKickoffRequestSchema,
  SwarmInputSchema,
  AgentInputSchema,
  TaskInputSchema,
  SwarmPatchSchema,
} from "@/lib/forms/swarmSchemas";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ── SwarmKickoffRequestSchema ───────────────────────────────────────────────

describe("SwarmKickoffRequestSchema", () => {
  it("accepts a minimal valid payload (trigger only)", () => {
    const result = SwarmKickoffRequestSchema.safeParse({ trigger: "on_demand" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trigger).toBe("on_demand");
      // inputs defaults to undefined (optional)
    }
  });

  it("accepts all valid trigger values", () => {
    const triggers = ["morning", "evening", "intraday", "on_demand", "webhook"] as const;
    for (const trigger of triggers) {
      const result = SwarmKickoffRequestSchema.safeParse({ trigger });
      expect(result.success, `trigger '${trigger}' should be valid`).toBe(true);
    }
  });

  it("rejects an invalid trigger value", () => {
    const result = SwarmKickoffRequestSchema.safeParse({ trigger: "invalid_trigger" });
    expect(result.success).toBe(false);
  });

  it("accepts optional inputs dict", () => {
    const result = SwarmKickoffRequestSchema.safeParse({
      trigger: "morning",
      inputs: { date: "2026-05-18", user: "adrien" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inputs).toEqual({ date: "2026-05-18", user: "adrien" });
    }
  });

  it("rejects missing trigger (required field)", () => {
    const result = SwarmKickoffRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── SwarmInputSchema ────────────────────────────────────────────────────────
// Mirrors Pydantic SwarmCreate in routes/swarms.py:
//   name (required), description (optional str), agents/tasks/tool_bindings (optional list)

describe("SwarmInputSchema", () => {
  it("accepts a minimal valid swarm (name only)", () => {
    const result = SwarmInputSchema.safeParse({ name: "My Swarm" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Swarm");
      // defaults applied
      expect(result.data.description).toBe("");
      expect(result.data.agents).toEqual([]);
      expect(result.data.tasks).toEqual([]);
      expect(result.data.tool_bindings).toEqual([]);
      expect(result.data.is_active).toBe(true);
      expect(result.data.is_template).toBe(false);
    }
  });

  it("rejects a swarm with name too short (< 2 chars)", () => {
    const result = SwarmInputSchema.safeParse({ name: "X" });
    expect(result.success).toBe(false);
  });

  it("rejects a swarm with name too long (> 120 chars)", () => {
    const result = SwarmInputSchema.safeParse({ name: "A".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("accepts a full valid swarm with agents and tasks", () => {
    const result = SwarmInputSchema.safeParse({
      name: "Chief of Staff",
      description: "Daily assistant",
      is_active: true,
      is_template: false,
      agents: [
        {
          name: "Coordinator",
          role: "coordinator",
          system_prompt: "You coordinate the team.",
          model_provider: "anthropic",
          model_name: "claude-opus-4-7",
        },
      ],
      tasks: [
        {
          agent_id: VALID_UUID,
          name: "Morning brief",
          description: "Prepare morning brief.",
          expected_output: "A markdown brief.",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an agent with invalid role", () => {
    const result = AgentInputSchema.safeParse({
      name: "Agent",
      role: "unknown_role",
      system_prompt: "Test",
      model_provider: "anthropic",
      model_name: "claude",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an agent with model_provider not in enum", () => {
    const result = AgentInputSchema.safeParse({
      name: "Agent",
      role: "coordinator",
      system_prompt: "Test",
      model_provider: "gemini",
      model_name: "gemini-pro",
    });
    expect(result.success).toBe(false);
  });

  it("accepts anthropic and hypercli as valid model providers (engine alignment)", () => {
    for (const provider of ["anthropic", "openai", "kimi", "hypercli"] as const) {
      const result = AgentInputSchema.safeParse({
        name: "Agent",
        role: "analyst",
        system_prompt: "Analyse data.",
        model_provider: provider,
        model_name: "some-model",
      });
      expect(result.success, `provider '${provider}' should be valid`).toBe(true);
    }
  });

  it("TaskInputSchema rejects task without agent_id", () => {
    const result = TaskInputSchema.safeParse({
      name: "Task",
      description: "Do something.",
      expected_output: "Done.",
    });
    expect(result.success).toBe(false);
  });
});

// ── SwarmPatchSchema ────────────────────────────────────────────────────────
// Mirrors Pydantic SwarmUpdate (all fields optional, no defaults)

describe("SwarmPatchSchema", () => {
  it("accepts a partial patch (only name)", () => {
    const result = SwarmPatchSchema.safeParse({ name: "Updated Name" });
    expect(result.success).toBe(true);
    if (result.success) {
      // transform strips undefined — only 'name' should be present
      expect(Object.keys(result.data)).toEqual(["name"]);
    }
  });

  it("accepts an empty patch object", () => {
    // The schema has no required fields — empty object is valid Zod-wise
    const result = SwarmPatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a patch with invalid is_active type", () => {
    const result = SwarmPatchSchema.safeParse({ is_active: "yes" });
    expect(result.success).toBe(false);
  });
});
