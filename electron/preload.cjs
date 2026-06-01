const path = require("node:path");
const { contextBridge, ipcRenderer } = require("electron");

function resolveDesktopAppPath() {
  if (process.platform !== "darwin" || !process.resourcesPath) return "";
  const appPath = path.dirname(path.dirname(process.resourcesPath));
  return appPath.endsWith(".app") ? appPath : "";
}

contextBridge.exposeInMainWorld("posterLabDesktop", {
  platform: process.platform,
  appPath: resolveDesktopAppPath(),
  onNextExit(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("poster-lab:next-exit", handler);
    return () => ipcRenderer.removeListener("poster-lab:next-exit", handler);
  },
});
