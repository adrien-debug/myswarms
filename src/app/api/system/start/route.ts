import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

// Résout le binaire uv (gestionnaire Python de l'engine)
function resolveUvBin(): string {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".local", "bin", "uv"),
    "/opt/homebrew/bin/uv",
    "/usr/local/bin/uv",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "uv";
}

function resolveEngineDir(): string {
  // En dev : relatif au CWD (process.cwd() = repo root)
  const devPath = path.join(process.cwd(), "services", "crewai-engine");
  if (existsSync(devPath)) return devPath;
  // Fallback hardcodé (même logique que Electron)
  return path.join(os.homedir(), "Dev", "myswarms", "services", "crewai-engine");
}

export async function POST(): Promise<NextResponse> {
  // Vérifier d'abord si l'engine est déjà up
  const engineUrl = process.env.CREWAI_ENGINE_URL ?? "http://localhost:8000";
  try {
    const check = await fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(1500) });
    if (check.ok) return NextResponse.json({ status: "already_running" });
  } catch { /* down, on continue */ }

  const uv = resolveUvBin();
  const cwd = resolveEngineDir();

  if (!existsSync(cwd)) {
    return NextResponse.json({ status: "error", message: "Engine directory not found" }, { status: 500 });
  }

  // Spawn détaché — le process survit à la requête HTTP
  const child = spawn(
    uv,
    ["run", "uvicorn", "src.main:app", "--port", "8000"],
    {
      cwd,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    }
  );
  child.unref();

  // Attendre max 8s que l'engine réponde
  for (let i = 0; i < 16; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`${engineUrl}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return NextResponse.json({ status: "started" });
    } catch { /* still booting */ }
  }

  return NextResponse.json({ status: "starting" }); // toujours en cours
}
