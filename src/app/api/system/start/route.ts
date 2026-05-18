import { NextResponse } from "next/server";
import { spawn, type SpawnOptions } from "child_process";

export const dynamic = "force-dynamic";

/** Variables d'environnement explicitement autorisées à être transmises au sous-processus engine. */
const ENGINE_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "LANG",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "COMPOSIO_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREWAI_ENGINE_AUTH_TOKEN",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_HOST",
] as const;

/**
 * POST /api/system/start
 *
 * Lance le microservice CrewAI engine en local (dev uniquement).
 * Désactivé en production — retourne 403 immédiatement sans spawn.
 *
 * Sécurité :
 * - Bloqué en production (NODE_ENV === "production").
 * - Env transmis au sous-processus via allowlist explicite (pas de spread process.env).
 */
export async function POST(): Promise<NextResponse> {
  // P0 : désactivé en production — aucun spawn.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { status: "error", message: "disabled in production" },
      { status: 403 },
    );
  }

  // Construire l'env allowlist : n'inclure que les vars définies.
  const allowedEnv: Record<string, string> = {};
  for (const key of ENGINE_ENV_ALLOWLIST) {
    const val = process.env[key];
    if (val !== undefined) {
      allowedEnv[key] = val;
    }
  }

  try {
    const spawnOpts: SpawnOptions = {
      cwd: process.cwd() + "/services/crewai-engine",
      env: allowedEnv as NodeJS.ProcessEnv,
      detached: true,
      stdio: "ignore",
    };
    const child = spawn(
      "uv",
      ["run", "uvicorn", "src.main:app", "--reload", "--port", "8000"],
      spawnOpts,
    );
    child.unref();

    return NextResponse.json({ status: "started", pid: child.pid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
