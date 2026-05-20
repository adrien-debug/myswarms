import { createCockpitChatHandler } from "@hearst/cockpit-shell/handler";
import type { ChatPersistence, ChatMessage } from "@hearst/cockpit-shell";
import { kimi, KIMI_MODEL } from "@/lib/llm/kimi";
import { createClient } from "@/lib/supabase/server";
import { traceChatEvent } from "@/lib/observability/langfuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Implémentation ChatPersistence branché sur Supabase.
 *
 * Le client Supabase (et l'identité user) est résolu de façon lazy à chaque
 * appel de méthode — la route est Node, pas Edge, ce qui permet l'async
 * sans contrainte. RLS assure l'isolation par user côté DB.
 *
 * En cas d'erreur Supabase, les méthodes ne lèvent PAS d'exception : un
 * échec de persistance ne doit pas bloquer le stream LLM.
 */
const cockpitPersistence: ChatPersistence = {
  async createChat(): Promise<string> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return crypto.randomUUID();

      const { data, error } = await supabase
        .from("cockpit_chats")
        .insert({ user_id: user.id })
        .select("id")
        .single();

      if (error || !data) return crypto.randomUUID();
      return data.id;
    } catch {
      return crypto.randomUUID();
    }
  },

  async saveMessage(chatId: string, msg: ChatMessage): Promise<void> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("cockpit_messages").insert({
        id: msg.id,
        chat_id: chatId,
        role: msg.role,
        content: msg.content,
        created_at: new Date(msg.createdAt).toISOString(),
      });
    } catch {
      // persistance optionnelle — ne pas bloquer le stream
    }
  },

  async loadMessages(chatId: string): Promise<ChatMessage[]> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("cockpit_messages")
        .select("id, role, content, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error || !data) return [];

      return data.map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        createdAt: new Date(row.created_at ?? 0).getTime(),
      }));
    } catch {
      return [];
    }
  },
};

const BASE_SYSTEM_PROMPT =
  "Tu es l'assistant Kimi intégré à Hearst Hive — builder visuel de swarms multi-agents & Daily Chief of Staff. Réponds en français.";

const baseConfig = {
  llmClient: kimi,
  model: KIMI_MODEL,
  systemPrompt: BASE_SYSTEM_PROMPT,
  persistence: cockpitPersistence,
  // Rate-limit par user authentifié (évite les faux positifs en NAT entreprise).
  // Le store interne du handler est au niveau module → partagé entre les
  // instances créées par requête, l'intégrité du rate-limit est préservée.
  rateLimitMax: 50,
  rateLimitWindowMs: 60_000,
};

/**
 * Contexte « runs récents » injecté dans le system prompt (RAG léger).
 * Best-effort : toute erreur → chaîne vide, jamais de throw, jamais bloquant.
 * Le scoping par utilisateur est assuré par la RLS Supabase (client serveur
 * porteur de la session) — pas de filtre owner_id manuel nécessaire.
 */
async function buildRunsContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  try {
    const [chief, swarms] = await Promise.all([
      supabase
        .from("chief_run_log")
        .select("id,kickoff_id,status,trigger,started_at,finished_at,error_text")
        .order("started_at", { ascending: false })
        .limit(8),
      supabase
        .from("swarm_runs")
        .select("id,swarm_id,started_at,finished_at,error_text")
        .order("started_at", { ascending: false })
        .limit(8),
    ]);

    const lines: string[] = [];

    if (chief.data && chief.data.length > 0) {
      lines.push("Daily Chief of Staff — chief_run_log :");
      for (const r of chief.data) {
        const end = r.finished_at ?? "(en cours)";
        const err = r.error_text ? ` [err: ${r.error_text.slice(0, 120)}]` : "";
        lines.push(
          `- [${r.status}] trigger=${r.trigger} · ${r.started_at} → ${end} · kickoff=${r.kickoff_id}${err}`,
        );
      }
    }

    if (swarms.data && swarms.data.length > 0) {
      lines.push("", "Swarm runs — swarm_runs :");
      for (const r of swarms.data) {
        const status = r.error_text
          ? "error"
          : r.finished_at
            ? "ok"
            : "running";
        const end = r.finished_at ?? "(en cours)";
        const err = r.error_text ? ` [err: ${r.error_text.slice(0, 120)}]` : "";
        lines.push(
          `- [${status}] swarm=${r.swarm_id} · ${r.started_at} → ${end}${err}`,
        );
      }
    }

    if (lines.length === 0) return "";

    return [
      "",
      "─── Contexte : logs de run récents de l'utilisateur (lecture seule, RLS) ───",
      ...lines,
      "",
      "Quand l'utilisateur demande ses logs/runs, appuie-toi sur ces données. Si vide ou insuffisant, dis-le et oriente vers /crews/chief-of-staff/history ou la page du run.",
    ].join("\n");
  } catch {
    return "";
  }
}

export async function POST(req: Request): Promise<Response> {
  let userId: string | undefined;
  let runsContext = "";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
    if (userId) {
      runsContext = await buildRunsContext(supabase);
    }
  } catch {
    // Pas de session résolvable → fallback rate-limit par IP (comportement handler).
  }

  traceChatEvent({ name: "cockpit-chat", userId, model: KIMI_MODEL, metadata: { runtime: "nodejs" } });
  const { POST: handler } = createCockpitChatHandler({
    ...baseConfig,
    systemPrompt: runsContext
      ? `${BASE_SYSTEM_PROMPT}\n${runsContext}`
      : BASE_SYSTEM_PROMPT,
    userId,
  });
  return handler(req);
}
