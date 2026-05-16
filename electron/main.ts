import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store<{ env: "local" | "prod" }>({ defaults: { env: "local" } });

const ENV_URLS = {
  local: "http://localhost:3000",
  prod: "https://myswarms.vercel.app",
};

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

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

ipcMain.handle("select-env", (_, env: "local" | "prod") => {
  splashWindow?.close();
  createMainWindow(env);
});

ipcMain.handle("get-last-env", () => store.get("env", "local"));

app.whenReady().then(() => {
  createSplash();
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createSplash();
});

autoUpdater.on("update-downloaded", () => {
  autoUpdater.quitAndInstall();
});
