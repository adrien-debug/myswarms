import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  selectEnv: (env: "local" | "prod") => ipcRenderer.invoke("select-env", env),
  getLastEnv: () => ipcRenderer.invoke("get-last-env"),
  platform: process.platform,
});
