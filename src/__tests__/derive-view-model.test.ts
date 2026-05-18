/**
 * Test suite — deriveViewModel()
 *
 * Tests all code branches of the pure function that transforms a RunSummary +
 * RunStep[] + Decision[] into a ChiefHomeViewModel. No mocks needed — we test
 * the real function with inline fixture data.
 */
import { describe, it, expect } from "vitest";
import { deriveViewModel } from "@/lib/crews/deriveViewModel";
import type { RunSummary, RunStep, Decision } from "@/lib/crewai/types";

// ─── Constants (mirror deriveViewModel.ts internals) ─────────────────────────

const DIFF_TEXT_MAX_CHARS = 100;
const DRAFT_TEXT_MAX_CHARS = 600;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_UUID = "00000000-0000-0000-0000-000000000001";
const DECISION_UUID = "00000000-0000-0000-0000-000000000002";

const MOCK_RESULT_JSON = JSON.stringify({
  mode: "mock",
  trigger: "morning",
  inbox_summary: { total: 5, p0: 1, p1: 2, p2: 1, p3_p4: 1 },
  top_items: [
    {
      priority: "P0",
      from: "client@example.com",
      subject: "Contract review needed today",
      action: "Review and respond to contract",
    },
  ],
  drafts_prepared: 1,
  actions_automated: 2,
});

const PRODUCTION_RESULT_JSON = JSON.stringify({
  vip_contacts_identified: [
    { name: "Alice Martin", email: "alice@example.com", context: "Investor follow-up" },
  ],
  active_projects: ["ProjectX"],
  preference_hints: ["Always respond same day"],
});

const mockRun: RunSummary = {
  kickoff_id: VALID_UUID,
  trigger: "morning",
  status: "completed",
  started_at: "2026-05-18T08:00:00.000Z",
  finished_at: "2026-05-18T08:12:00.000Z",
  result: MOCK_RESULT_JSON,
};

const makeStep = (
  agentName: string,
  output: string,
  finishedAt = "2026-05-18T08:05:00.000Z",
): RunStep => ({
  step_index: 0,
  agent_name: agentName,
  task_name: "some task",
  output_text: output,
  started_at: "2026-05-18T08:04:00.000Z",
  finished_at: finishedAt,
  latency_ms: 60000,
});

const makeDecision = (
  action: Decision["action"],
  snooze_until?: string | null,
): Decision => ({
  id: DECISION_UUID,
  action,
  snooze_until: snooze_until ?? null,
  created_at: "2026-05-18T08:10:00.000Z",
});

// Fixed "now" for all tests — well after the mock run's start time
const NOW = new Date("2026-05-18T09:00:00.000Z");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("deriveViewModel()", () => {
  it("null run → all agents idle (except Daily Planner), p0Item=null, draftText=null, runStats=null, 0 diff items", () => {
    const vm = deriveViewModel(null, [], [], NOW);

    expect(vm.run).toBeNull();
    expect(vm.p0Item).toBeNull();
    expect(vm.draftText).toBeNull();
    expect(vm.runStats).toBeNull();
    expect(vm.diffItems).toHaveLength(0);

    for (const agent of vm.agentRows) {
      if (agent.name === "Daily Planner") {
        expect(agent.status).toBe("pending");
        expect(agent.statusLabel).toBe("V2 pending");
      } else {
        expect(agent.status).toBe("idle");
      }
    }
  });

  // 2. Completed run + no steps → synthetic path from mock result
  it("completed run + no steps → P0 from top_items, draftText placeholder, agents 'Terminé', timeline has Brief matin + Brief soir", () => {
    const vm = deriveViewModel(mockRun, [], [], NOW);

    expect(vm.p0Item).not.toBeNull();
    expect(vm.p0Item?.from).toBe("client@example.com");
    expect(vm.p0Item?.subject).toBe("Contract review needed today");

    expect(vm.draftText).toContain("Brouillon");

    expect(vm.runStats).toEqual({ total: 5, p0: 1, p1: 2 });

    for (const agent of vm.agentRows) {
      if (agent.name === "Daily Planner") {
        expect(agent.statusLabel).toBe("V2 pending");
      } else {
        expect(agent.statusLabel).toBe("Terminé");
      }
    }

    const labels = vm.timelineMarkers.map((m) => m.label);
    expect(labels).toContain("Brief matin");
    expect(labels).toContain("Brief soir");
  });

  it("completed run + steps (no draft step) → agentRows from steps, diffItems from steps (output_text truncated to 100 chars), p0Item from mock result", () => {
    const longOutput = "A".repeat(150); // longer than DIFF_TEXT_MAX_CHARS
    const steps: RunStep[] = [
      makeStep("Chief of Staff Agent", "Coordinating the brief."),
      makeStep("Inbox Collector", longOutput),
      makeStep("Classifier", "Short output"),
    ];

    const vm = deriveViewModel(mockRun, steps, [], NOW);

    // P0 still comes from mock result JSON
    expect(vm.p0Item).not.toBeNull();
    expect(vm.p0Item?.from).toBe("client@example.com");

    expect(vm.diffItems).toHaveLength(3);

    const inboxItem = vm.diffItems[1];
    expect(inboxItem.text.length).toBe(DIFF_TEXT_MAX_CHARS + 1); // +1 for "…"
    expect(inboxItem.text.endsWith("…")).toBe(true);

    const classifierItem = vm.diffItems[2];
    expect(classifierItem.text).toBe("Short output");

    const chiefRow = vm.agentRows.find((r) => r.name === "Chief of Staff");
    expect(chiefRow?.status).toBe("idle");
    expect(chiefRow?.statusLabel).toMatch(/Terminé/);
  });

  it("completed run + steps + draft step → draftText from Draft Writer step (truncated to 600 chars if long)", () => {
    const longDraft = "D".repeat(700); // longer than DRAFT_TEXT_MAX_CHARS
    const shortDraft = "Short draft content";

    const stepsLong: RunStep[] = [
      makeStep("Draft Writer Agent", longDraft),
    ];
    const stepsShort: RunStep[] = [
      makeStep("Draft Writer Agent", shortDraft),
    ];

    const vmLong = deriveViewModel(mockRun, stepsLong, [], NOW);
    expect(vmLong.draftText).not.toBeNull();
    expect(vmLong.draftText!.length).toBe(DRAFT_TEXT_MAX_CHARS + 1); // +1 for "…"
    expect(vmLong.draftText!.endsWith("…")).toBe(true);

    const vmShort = deriveViewModel(mockRun, stepsShort, [], NOW);
    expect(vmShort.draftText).toBe(shortDraft);
  });

  it("completed run + steps + rejected decision → p0Item = null", () => {
    const steps: RunStep[] = [makeStep("Inbox Collector", "collected")];
    const decisions: Decision[] = [makeDecision("rejected")];

    const vm = deriveViewModel(mockRun, steps, decisions, NOW);

    expect(vm.p0Item).toBeNull();
  });

  it("completed run + steps + snoozed decision (snooze_until in future) → p0Item = null", () => {
    const steps: RunStep[] = [makeStep("Inbox Collector", "collected")];
    const snoozeUntil = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    const decisions: Decision[] = [makeDecision("snoozed", snoozeUntil)];

    const vm = deriveViewModel(mockRun, steps, decisions, NOW);

    expect(vm.p0Item).toBeNull();
  });

  it("completed run + steps + snoozed decision (snooze_until in past) → p0Item present (snooze expired)", () => {
    const steps: RunStep[] = [makeStep("Inbox Collector", "collected")];
    const snoozeUntil = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    const decisions: Decision[] = [makeDecision("snoozed", snoozeUntil)];

    const vm = deriveViewModel(mockRun, steps, decisions, NOW);

    expect(vm.p0Item).not.toBeNull();
    expect(vm.p0Item?.from).toBe("client@example.com");
  });

  it("running run + no steps → at least one agent active, synthetic diffItems from parsed result", () => {
    const runningRun: RunSummary = {
      ...mockRun,
      status: "running",
      finished_at: null,
      result: MOCK_RESULT_JSON,
    };

    // NOW is 60s after start → estimatedStep index = 1 (60000ms / 60000ms per agent)
    const now60s = new Date(
      new Date(runningRun.started_at).getTime() + 60_000,
    );

    const vm = deriveViewModel(runningRun, [], [], now60s);

    const activeAgents = vm.agentRows.filter((r) => r.status === "active");
    expect(activeAgents.length).toBeGreaterThanOrEqual(1);

    expect(vm.diffItems.length).toBeGreaterThan(0);
    const agentNames = vm.diffItems.map((d) => d.agentName);
    expect(agentNames).toContain("Inbox Collector");
  });

  it("completed run with production result → p0Item from vip contacts, runStats from vips", () => {
    const productionRun: RunSummary = {
      kickoff_id: VALID_UUID,
      trigger: "morning",
      status: "completed",
      started_at: "2026-05-18T08:00:00.000Z",
      finished_at: "2026-05-18T08:12:00.000Z",
      result: PRODUCTION_RESULT_JSON,
    };

    const vm = deriveViewModel(productionRun, [], [], NOW);

    expect(vm.p0Item).not.toBeNull();
    expect(vm.p0Item?.from).toBe("Alice Martin");
    expect(vm.p0Item?.subject).toBe("Investor follow-up");
    expect(vm.p0Item?.action).toBe("Always respond same day");

    expect(vm.runStats).toEqual({ total: 1, p0: 1, p1: 0 });
  });

  it("steps where agent_name matches 'Daily Planner' → that agent keeps status 'pending' and statusLabel 'V2 pending'", () => {
    const steps: RunStep[] = [
      makeStep("Daily Planner Agent", "Schedule built"),
      makeStep("Inbox Collector", "Inbox collected"),
    ];

    const vm = deriveViewModel(mockRun, steps, [], NOW);

    const plannerRow = vm.agentRows.find((r) => r.name === "Daily Planner");
    expect(plannerRow).toBeDefined();
    expect(plannerRow?.status).toBe("pending");
    expect(plannerRow?.statusLabel).toBe("V2 pending");
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("step with empty output_text → diffItem text falls back to 'a terminé'", () => {
    const steps: RunStep[] = [
      { ...makeStep("Classifier", ""), output_text: "" },
    ];

    const vm = deriveViewModel(mockRun, steps, [], NOW);
    const item = vm.diffItems[0];
    expect(item.text).toBe("a terminé");
  });

  it("step without finished_at → agent row status is 'active'", () => {
    const steps: RunStep[] = [
      {
        step_index: 0,
        agent_name: "Inbox Collector",
        task_name: "collect",
        output_text: "still running",
        started_at: "2026-05-18T08:04:00.000Z",
        finished_at: null,
        latency_ms: null,
      },
    ];

    const vm = deriveViewModel(mockRun, steps, [], NOW);
    const row = vm.agentRows.find((r) => r.name === "Inbox Collector");
    expect(row?.status).toBe("active");
    expect(row?.statusLabel).toBe("En cours…");
  });

  it("failed run (no steps) → agents statusLabel is 'Erreur'", () => {
    const failedRun: RunSummary = {
      ...mockRun,
      status: "failed",
      result: null,
    };

    const vm = deriveViewModel(failedRun, [], [], NOW);

    for (const agent of vm.agentRows) {
      if (agent.name === "Daily Planner") continue;
      expect(agent.statusLabel).toBe("Erreur");
    }
  });

  it("snoozed decision with null snooze_until → treated as still active → p0Item = null", () => {
    const decisions: Decision[] = [makeDecision("snoozed", null)];

    const vm = deriveViewModel(mockRun, [], decisions, NOW);

    expect(vm.p0Item).toBeNull();
  });

  it("run result is invalid JSON → p0Item=null, runStats=null, 0 diff items", () => {
    const badRun: RunSummary = {
      ...mockRun,
      result: "{not valid json",
    };

    const vm = deriveViewModel(badRun, [], [], NOW);

    expect(vm.p0Item).toBeNull();
    expect(vm.runStats).toBeNull();
    expect(vm.diffItems).toHaveLength(0);
  });

  it("production result with no vip_contacts_identified → p0Item=null, runStats total=0", () => {
    const emptyProductionRun: RunSummary = {
      kickoff_id: VALID_UUID,
      trigger: "morning",
      status: "completed",
      started_at: "2026-05-18T08:00:00.000Z",
      finished_at: "2026-05-18T08:05:00.000Z",
      result: JSON.stringify({ vip_contacts_identified: [] }),
    };

    const vm = deriveViewModel(emptyProductionRun, [], [], NOW);

    expect(vm.p0Item).toBeNull();
    expect(vm.runStats).toEqual({ total: 0, p0: 0, p1: 0 });
  });

  it("timeline markers have valid leftPercent (not NaN) even when run starts at 18:30", () => {
    const lateRun: RunSummary = {
      kickoff_id: "00000000-0000-0000-0000-000000000099",
      trigger: "evening",
      status: "completed",
      started_at: "2026-05-18T18:30:00.000Z", // exactly at 18:30 UTC
      finished_at: "2026-05-18T18:40:00.000Z",
      result: JSON.stringify({ mode: "mock", trigger: "morning", inbox_summary: { total: 1, p0: 0, p1: 0, p2: 0, p3_p4: 1 }, top_items: [] }),
    };
    const vm = deriveViewModel(lateRun, [], [], new Date("2026-05-18T18:35:00.000Z"));
    vm.timelineMarkers.forEach((m) => {
      expect(Number.isFinite(m.leftPercent)).toBe(true);
    });
  });

  it("timeline from steps always includes 'Brief soir' marker at 96%", () => {
    const steps: RunStep[] = [
      makeStep("Inbox Collector", "done"),
    ];

    const vm = deriveViewModel(mockRun, steps, [], NOW);

    const soir = vm.timelineMarkers.find((m) => m.label === "Brief soir");
    expect(soir).toBeDefined();
    expect(soir?.leftPercent).toBe(96);
    expect(soir?.variant).toBe("future");
  });
});
