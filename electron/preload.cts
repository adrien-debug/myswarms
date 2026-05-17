import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type BootStatus = { message: string; state: "info" | "error" | "ready" };

contextBridge.exposeInMainWorld("electron", {
  selectEnv: (env: "local" | "prod") => ipcRenderer.invoke("select-env", env),
  getLastEnv: () => ipcRenderer.invoke("get-last-env"),
  onBootStatus: (cb: (status: BootStatus) => void) => {
    const handler = (_e: IpcRendererEvent, status: BootStatus) => cb(status);
    ipcRenderer.on("boot-status", handler);
    return () => ipcRenderer.removeListener("boot-status", handler);
  },
  platform: process.platform,
});
