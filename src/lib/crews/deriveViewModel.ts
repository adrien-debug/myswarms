import type { RunSummary } from "@/lib/crewai/types";
import type {
  ChiefHomeViewModel,
  AgentRow,
  DiffItem,
  TimelineMarker,
  MockResult,
  ProductionResult,
  P0Item,
  RunStats,
} from "./chiefTypes";

// 9 agents statiques dans l'ordre séquentiel
const AGENT_DEFS: Pick<AgentRow, "icon" | "name">[] = [
  { icon: "🎯", name: "Chief of Staff" },
  { icon: "📥", name: "Inbox Collector" },
  { icon: "🏷️", name: "Classifier" },
  { icon: "⚡", name: "Priority" },
  { icon: "✅", name: "Action Extractor" },
  { icon: "📅", name: "Daily Planner" },
  { icon: "✍️", name: "Draft Writer" },
  { icon: "⚙️", name: "Automation" },
  { icon: "🧠", name: "Memory" },
];

function isMockResult(r: unknown): r is MockResult {
  return typeof r === "object" && r !== null && (r as MockResult).mode === "mock";
}

function isProductionResult(r: unknown): r is ProductionResult {
  return typeof r === "object" && r !== null && "vip_contacts_identified" in r;
}

function tryParse(result: string | null | undefined): MockResult | ProductionResult | null {
  if (!result) return null;
  try {
    return JSON.parse(result) as MockResult | ProductionResult;
  } catch {
    return null;
  }
}

function formatHHMM(date: Date): string {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function addMinutes(base: Date, min: number): Date {
  return new Date(base.getTime() + min * 60_000);
}

function extractP0(parsed: MockResult | ProductionResult | null): P0Item | null {
  if (!parsed) return null;
  if (isMockResult(parsed)) {
    const item = parsed.top_items?.find((i) => i.priority === "P0");
    if (item) return { from: item.from, subject: item.subject ?? item.action, action: item.action, channel: item.channel };
  }
  if (isProductionResult(parsed)) {
    const vip = parsed.vip_contacts_identified?.[0];
    const hint = parsed.preference_hints?.[0];
    if (vip) return { from: vip.name, subject: vip.context ?? hint ?? "Action requise", action: hint ?? "Traiter ce contact" };
  }
  return null;
}

function deriveRunStats(parsed: MockResult | ProductionResult | null): RunStats | null {
  if (!parsed) return null;
  if (isMockResult(parsed) && parsed.inbox_summary) {
    return { total: parsed.inbox_summary.total, p0: parsed.inbox_summary.p0, p1: parsed.inbox_summary.p1 };
  }
  if (isProductionResult(parsed)) {
    const vips = parsed.vip_contacts_identified?.length ?? 0;
    return { total: vips, p0: vips > 0 ? 1 : 0, p1: 0 };
  }
  return null;
}

function deriveAgentRows(run: RunSummary | null, now: Date): AgentRow[] {
  return AGENT_DEFS.map((def, idx) => {
    // Planner est toujours V2 pending
    if (def.name === "Daily Planner") {
      return { ...def, status: "pending" as const, statusLabel: "V2 pending" };
    }
    if (!run) return { ...def, status: "idle" as const, statusLabel: "—" };
    if (
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "cancelled"
    ) {
      return {
        ...def,
        status: "idle" as const,
        statusLabel: run.status === "failed" ? "Erreur" : "Terminé",
      };
    }
    if (run.status === "running") {
      const elapsed = now.getTime() - new Date(run.started_at).getTime();
      // On suppose 9 agents actifs sur ~600s total → ~60s par agent
      const estimatedStep = Math.min(Math.floor(elapsed / 60_000), AGENT_DEFS.length - 1);
      if (idx === 0)
        return {
          ...def,
          status: "active" as const,
          statusLabel: `Coordinating · ${Math.round(elapsed / 1000)}s`,
        };
      if (idx === estimatedStep)
        return { ...def, status: "active" as const, statusLabel: "En cours…" };
      if (idx < estimatedStep)
        return { ...def, status: "idle" as const, statusLabel: "Terminé" };
      return { ...def, status: "idle" as const, statusLabel: "En attente" };
    }
    return { ...def, status: "idle" as const, statusLabel: "—" };
  });
}

function deriveDiffItems(
  run: RunSummary | null,
  parsed: MockResult | ProductionResult | null,
): DiffItem[] {
  if (!run || !parsed) return [];
  const base = new Date(run.started_at);
  const items: DiffItem[] = [];
  if (isMockResult(parsed)) {
    const s = parsed.inbox_summary;
    if (s)
      items.push({
        time: formatHHMM(addMinutes(base, 0)),
        agentName: "Inbox Collector",
        text: `a aspiré **${s.total} items** (Gmail · Slack · Telegram)`,
      });
    if (s)
      items.push({
        time: formatHHMM(addMinutes(base, 2)),
        agentName: "Classifier",
        text: `a flaggé **${s.p0} P0** (${s.p1} P1)`,
      });
    if (parsed.drafts_prepared)
      items.push({
        time: formatHHMM(addMinutes(base, 6)),
        agentName: "Draft Writer",
        text: `a préparé **${parsed.drafts_prepared} brouillon(s)**`,
      });
    if (parsed.actions_automated)
      items.push({
        time: formatHHMM(addMinutes(base, 8)),
        agentName: "Automation",
        text: `a exécuté **${parsed.actions_automated} action(s)**`,
      });
    items.push({
      time: formatHHMM(addMinutes(base, 10)),
      agentName: "Memory",
      text: "a mis à jour les VIPs et préférences",
    });
  } else if (isProductionResult(parsed)) {
    const vips = parsed.vip_contacts_identified?.length ?? 0;
    items.push({
      time: formatHHMM(addMinutes(base, 0)),
      agentName: "Inbox Collector",
      text: "a collecté les messages",
    });
    items.push({
      time: formatHHMM(addMinutes(base, 2)),
      agentName: "Classifier",
      text: "a classifié les messages",
    });
    if (vips > 0)
      items.push({
        time: formatHHMM(addMinutes(base, 8)),
        agentName: "Memory",
        text: `a identifié **${vips} contact(s) VIP**`,
      });
  }
  return items;
}

function deriveTimeline(run: RunSummary | null, now: Date): TimelineMarker[] {
  if (!run) return [];
  const startMs = new Date(run.started_at).getTime();
  // Cible 18:30 comme référence de fin de journée
  const today1830 = new Date(run.started_at);
  today1830.setHours(18, 30, 0, 0);
  const totalSpan = today1830.getTime() - startMs;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pct = (ms: number) => clamp(((ms - startMs) / totalSpan) * 100);
  const parsed = tryParse(run.result);
  const hasDrafts = isMockResult(parsed) ? (parsed.drafts_prepared ?? 0) > 0 : false;
  const hasP0 = extractP0(parsed) !== null;
  const markers: TimelineMarker[] = [
    {
      leftPercent: Math.max(2, pct(startMs)),
      time: formatHHMM(new Date(run.started_at)),
      label: "Brief matin",
      variant: "done",
    },
  ];
  if (hasP0)
    markers.push({
      leftPercent: pct(startMs + 2 * 60_000),
      time: formatHHMM(new Date(startMs + 2 * 60_000)),
      label: "P0 détecté",
      variant: run.status === "completed" ? "done" : "now",
    });
  if (hasDrafts)
    markers.push({
      leftPercent: pct(startMs + 6 * 60_000),
      time: formatHHMM(new Date(startMs + 6 * 60_000)),
      label: "Brouillon prêt",
      variant: "done",
    });
  const nowPct = pct(now.getTime());
  if (nowPct > 5 && nowPct < 95)
    markers.push({
      leftPercent: nowPct,
      time: formatHHMM(now),
      label: "▼ Tu es ici",
      variant: "now",
    });
  markers.push({ leftPercent: 96, time: "18:30", label: "Brief soir", variant: "future" });
  return markers;
}

export function deriveViewModel(run: RunSummary | null, now: Date): ChiefHomeViewModel {
  const parsed = tryParse(run?.result);
  return {
    run,
    p0Item: extractP0(parsed),
    draftText:
      isMockResult(parsed) && (parsed.drafts_prepared ?? 0) > 0
        ? `[Brouillon généré — ${parsed.drafts_prepared} réponse(s) préparée(s). Cliquer Modifier pour accéder au brouillon complet.]`
        : null,
    agentRows: deriveAgentRows(run, now),
    diffItems: deriveDiffItems(run, parsed),
    timelineMarkers: deriveTimeline(run, now),
    runStats: deriveRunStats(parsed),
  };
}
