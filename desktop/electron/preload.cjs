// Узкий мост между окном и главным процессом. Окно не имеет доступа к Node, файлам и сети.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("pleeply", {
  invoke: (method, arg) => ipcRenderer.invoke("pleeply:invoke", String(method), arg),
  on: (fn) => {
    const h = (_e, ev) => fn(ev);
    ipcRenderer.on("pleeply:event", h);
    return () => ipcRenderer.removeListener("pleeply:event", h);
  },
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },
  platform: process.platform,
});
