import type { RunSummary } from "@/lib/crewai/types";

export interface AgentRow {
  initials: string;
  name: string;
  status: "active" | "idle" | "pending";
  statusLabel: string;
}

export interface P0Item {
  from: string;
  subject: string;
  action: string;
  channel?: string;
}

export interface DiffItem {
  time: string;      // "HH:MM" format
  agentName: string;
  text: string;      // peut contenir des marqueurs **gras** pour les quantités
}

export interface TimelineMarker {
  leftPercent: number;
  time: string;      // "HH:MM"
  label: string;
  variant: "done" | "now" | "future";
}

export interface RunStats {
  total: number;
  p0: number;
  p1: number;
}

export interface ChiefHomeViewModel {
  run: RunSummary | null;
  p0Item: P0Item | null;
  draftText: string | null;
  agentRows: AgentRow[];
  diffItems: DiffItem[];
  timelineMarkers: TimelineMarker[];
  runStats: RunStats | null;
}

// Shapes du champ result JSON
export interface MockResult {
  mode: "mock";
  trigger: string;
  inbox_summary?: { total: number; p0: number; p1: number; p2: number; p3_p4: number };
  top_items?: Array<{ priority: string; from: string; subject?: string; channel?: string; action: string }>;
  schedule?: Array<{ time: string; type: string; description: string }>;
  drafts_prepared?: number;
  actions_automated?: number;
  note?: string;
}

export interface ProductionResult {
  vip_contacts_identified?: Array<{ name: string; email: string; context?: string }>;
  active_projects?: string[];
  recurring_topics?: string[];
  preference_hints?: string[];
}
