const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posterLabDesktop", {
  platform: process.platform,
  onNextExit(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("poster-lab:next-exit", handler);
    return () => ipcRenderer.removeListener("poster-lab:next-exit", handler);
  },
});
