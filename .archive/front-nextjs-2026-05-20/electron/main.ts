import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, createWriteStream, type WriteStream } from "node:fs";
import http from "node:http";
import path from "node:path";

// electron-store v11 est ESM-only : on le charge en dynamic import (le main
// process est compilé en CommonJS pour interop avec le module `electron`).
type EnvStore = {
  get: (key: "env", fallback?: "local" | "prod") => "local" | "prod";
  set: (key: "env", value: "local" | "prod") => void;
};
let store: EnvStore;
async function initStore() {
  const mod = await import("electron-store");
  const Store = mod.default;
  store = new Store({ defaults: { env: "local" } }) as unknown as EnvStore;
}

const ENV_URLS = {
  local: "http://localhost:3333",
  prod: "https://myswarms.vercel.app",
};

// --- Boot tuning constants (no magic numbers scattered in logic) ---
const ENGINE_PORT = 8000;
const FRONT_PORT = 3333;
const ENGINE_HEALTH_URL = `http://localhost:${ENGINE_PORT}/health`;
const FRONT_URL = `http://localhost:${FRONT_PORT}`;
const BOOT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;
const KILL_GRACE_MS = 3_000;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

let engineProc: ChildProcess | null = null;
let frontProc: ChildProcess | null = null;
let engineLog: WriteStream | null = null;
let frontLog: WriteStream | null = null;
let shuttingDown = false;
let localBootStarted = false;

/**
 * Résout la racine du repo MySwarms.
 *
 * Cas (a) dev non packagé : dist-electron/ est dans le repo, on remonte de 1 niveau.
 * Cas (b) packagé : le repo n'est PAS dans l'app bundle (.app/Contents/Resources/app),
 *   donc le chemin relatif ne contient pas services/crewai-engine. On retombe alors
 *   sur un chemin absolu hardcodé.
 *
 * DETTE EXPLICITE (V1 locale mono-machine) : le fallback ci-dessous est codé en dur
 * pour la machine d'Adrien uniquement. À rendre configurable (var d'env
 * MYSWARMS_REPO_ROOT ou fichier de conf utilisateur) avant toute distribution.
 */
const REPO_ROOT_FALLBACK = "/Users/adrienbeyondcrypto/Dev/myswarms";

function resolveRepoRoot(): string {
  const envOverride = process.env.MYSWARMS_REPO_ROOT;
  if (envOverride && existsSync(path.join(envOverride, "services", "crewai-engine"))) {
    return envOverride;
  }
  // dist-electron/main.js -> repo root est le parent
  const relative = path.resolve(__dirname, "..");
  if (existsSync(path.join(relative, "services", "crewai-engine"))) {
    return relative;
  }
  // Fallback packagé (dette documentée ci-dessus)
  return REPO_ROOT_FALLBACK;
}

/** Résout le binaire uv : ~/.local/bin, homebrew, /usr/local, sinon PATH. */
function resolveUvBin(): string {
  const home = app.getPath("home");
  const candidates = [
    path.join(home, ".local", "bin", "uv"),
    "/opt/homebrew/bin/uv",
    "/usr/local/bin/uv",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "uv"; // dernier recours : PATH
}

/**
 * Résout le binaire npm. Priorité au npm nvm le plus récent (cohérent avec
 * la version Node de build), puis homebrew / /usr/local, sinon PATH.
 */
function resolveNpmBin(): string {
  const home = app.getPath("home");
  const nvmRoot = path.join(home, ".nvm", "versions", "node");
  if (existsSync(nvmRoot)) {
    try {
      const versions = readdirSync(nvmRoot)
        .filter((v) => v.startsWith("v"))
        .sort()
        .reverse();
      for (const v of versions) {
        const npmPath = path.join(nvmRoot, v, "bin", "npm");
        if (existsSync(npmPath)) return npmPath;
      }
    } catch {
      /* ignore, on tombe sur les candidats suivants */
    }
  }
  const candidates = ["/opt/homebrew/bin/npm", "/usr/local/bin/npm"];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "npm"; // dernier recours : PATH
}

function sendBootStatus(message: string, state: "info" | "error" | "ready" = "info") {
  console.log(`[boot:${state}] ${message}`);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("boot-status", { message, state });
  }
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

function createMainWindow(env: "local" | "prod") {
  store.set("env", env);
  const url = ENV_URLS[env];

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: env === "prod",
    },
  });

  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Changer d'environnement…",
          click: () => {
            mainWindow?.close();
            createSplash();
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
  Menu.setApplicationMenu(menu);
}

// --- Health polling -------------------------------------------------------

function pingOnce(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const code = res.statusCode ?? 0;
      res.resume(); // drain
      // 200 ou 3xx = up (next start peut renvoyer 200 directement)
      resolve(code >= 200 && code < 400);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url: string, label: string, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (await pingOnce(url)) {
      sendBootStatus(`${label} prêt`);
      return true;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

// --- Child process orchestration -----------------------------------------

function ensureLogs() {
  const logsDir = app.getPath("logs");
  mkdirSync(logsDir, { recursive: true });
  engineLog = createWriteStream(path.join(logsDir, "engine.log"), { flags: "a" });
  frontLog = createWriteStream(path.join(logsDir, "front.log"), { flags: "a" });
  console.log(`[boot] logs -> ${logsDir}/{engine,front}.log`);
}

function pipeChild(child: ChildProcess, stream: WriteStream | null, tag: string) {
  const write = (buf: Buffer) => {
    const txt = buf.toString();
    if (stream) stream.write(txt);
    process.stdout.write(`[${tag}] ${txt}`);
  };
  child.stdout?.on("data", write);
  child.stderr?.on("data", write);
}

function spawnEngine(repoRoot: string) {
  const uv = resolveUvBin();
  const cwd = path.join(repoRoot, "services", "crewai-engine");
  sendBootStatus("Démarrage de l'engine…");
  console.log(`[boot] engine: ${uv} run uvicorn src.main:app --port ${ENGINE_PORT} (cwd=${cwd})`);
  engineProc = spawn(
    uv,
    ["run", "uvicorn", "src.main:app", "--port", String(ENGINE_PORT)],
    {
      cwd,
      // detached:true -> nouveau groupe de process : permet de tuer
      // l'arbre complet (uv -> uvicorn -> workers) via process.kill(-pid).
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    }
  );
  pipeChild(engineProc, engineLog, "engine");
  engineProc.on("exit", (code, sig) => {
    console.log(`[engine] exited code=${code} sig=${sig}`);
    if (!shuttingDown && code !== 0 && code !== null) {
      sendBootStatus(`Erreur : l'engine s'est arrêté (code ${code})`, "error");
    }
  });
}

function spawnFront(repoRoot: string) {
  const npm = resolveNpmBin();
  // Injecter le répertoire node dans PATH pour que le shebang #!/usr/bin/env node
  // soit résolu même quand Electron démarre sans le PATH nvm de l'utilisateur.
  const nodeBinDir = path.dirname(npm);
  const patchedEnv = {
    ...process.env,
    PORT: String(FRONT_PORT),
    PATH: `${nodeBinDir}:${process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"}`,
  };
  const hasBuild = existsSync(path.join(repoRoot, ".next"));
  // Si .next absent : build puis start. On chaîne via sh -c pour rester natif.
  sendBootStatus("Démarrage du front…");
  if (hasBuild) {
    console.log(`[boot] front: ${npm} run start (cwd=${repoRoot})`);
    frontProc = spawn(npm, ["run", "start"], {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: patchedEnv,
    });
  } else {
    sendBootStatus("Build du front (première fois)…");
    console.log(`[boot] front: ${npm} run build && ${npm} run start (cwd=${repoRoot})`);
    frontProc = spawn(
      "/bin/sh",
      ["-c", `"${npm}" run build && "${npm}" run start`],
      {
        cwd: repoRoot,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: patchedEnv,
      }
    );
  }
  pipeChild(frontProc, frontLog, "front");
  frontProc.on("exit", (code, sig) => {
    console.log(`[front] exited code=${code} sig=${sig}`);
    if (!shuttingDown && code !== 0 && code !== null) {
      sendBootStatus(`Erreur : le front s'est arrêté (code ${code})`, "error");
    }
  });
}

function killChild(child: ChildProcess | null, tag: string) {
  if (!child || child.killed || child.exitCode !== null) return;
  const pid = child.pid;
  if (!pid) return;
  try {
    // detached:true -> on tue tout le groupe (pid négatif).
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* déjà mort */
    }
  }
  setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
      console.log(`[shutdown] SIGKILL groupe ${tag} (${pid})`);
    } catch {
      /* déjà mort */
    }
  }, KILL_GRACE_MS);
}

function killAllChildren() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[shutdown] kill engine + front");
  killChild(engineProc, "engine");
  killChild(frontProc, "front");
  engineLog?.end();
  frontLog?.end();
}

/** Flow auto-spawn pour le mode local. */
async function bootLocal() {
  if (localBootStarted) {
    // Déjà des process : on rouvre juste la fenêtre.
    splashWindow?.close();
    createMainWindow("local");
    return;
  }
  localBootStarted = true;
  store.set("env", "local");
  ensureLogs();

  const repoRoot = resolveRepoRoot();
  console.log(`[boot] repoRoot=${repoRoot}`);

  spawnEngine(repoRoot);
  spawnFront(repoRoot);

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  const [engineOk, frontOk] = await Promise.all([
    waitForUrl(ENGINE_HEALTH_URL, "Engine", deadline),
    waitForUrl(FRONT_URL, "Front", deadline),
  ]);

  if (!engineOk || !frontOk) {
    const failed = [!engineOk && "engine", !frontOk && "front"]
      .filter(Boolean)
      .join(" + ");
    sendBootStatus(
      `Erreur : timeout au démarrage (${failed} injoignable après ${BOOT_TIMEOUT_MS / 1000}s). Voir logs.`,
      "error"
    );
    return; // on laisse le splash visible avec le message d'erreur
  }

  sendBootStatus("Prêt", "ready");
  splashWindow?.close();
  createMainWindow("local");
}

// --- IPC ------------------------------------------------------------------

ipcMain.handle("select-env", async (_, env: "local" | "prod") => {
  if (env === "prod") {
    splashWindow?.close();
    createMainWindow("prod"); // mode prod inchangé : pas de spawn, URL Vercel
    return;
  }
  await bootLocal();
});

ipcMain.handle("get-last-env", () => store.get("env", "local"));

// --- App lifecycle --------------------------------------------------------

app.whenReady().then(async () => {
  await initStore();
  createSplash();
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on("window-all-closed", () => {
  killAllChildren();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  killAllChildren();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createSplash();
});

autoUpdater.on("update-downloaded", () => {
  autoUpdater.quitAndInstall();
});
