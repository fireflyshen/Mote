import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("mote", {
  snapshot: () => ipcRenderer.invoke("notes:snapshot"),
  update: (content: string) => ipcRenderer.invoke("notes:update", content),
  select: (id: string) => ipcRenderer.invoke("notes:select", id),
  create: () => ipcRenderer.invoke("notes:new"),
  duplicate: () => ipcRenderer.invoke("notes:duplicate"),
  save: () => ipcRenderer.invoke("notes:save"),
  onState: (callback: (value: unknown) => void) => {
    const handler = (_event: unknown, value: unknown) => callback(value);
    ipcRenderer.on("notes:state", handler);
    return () => ipcRenderer.removeListener("notes:state", handler);
  },
  onFocus: (callback: () => void) => ipcRenderer.on("notes:focus", callback),
  onNotice: (callback: (message: string) => void) =>
    ipcRenderer.on("notes:notice", (_event, message: string) => callback(message)),
  platform: process.platform,
});
