const { contextBridge, ipcRenderer } = require("electron");

function formatInvokeError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || String(error);
  if (typeof error === "object") {
    const message =
      error.message ||
      error.error_description ||
      error.error ||
      error.statusText ||
      error.name;
    if (message) return String(message);
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

async function invoke(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    throw new Error(formatInvokeError(error));
  }
}

contextBridge.exposeInMainWorld("aeroApi", {
  getState: () => invoke("state:get"),
  getVersions: () => invoke("versions:get"),
  saveSettings: (settings) => invoke("settings:save", settings),
  addOfflineAccount: (payload) => invoke("account:addOffline", payload),
  removeAccount: (accountId) => invoke("account:remove", accountId),
  selectAccount: (accountId) => invoke("account:select", accountId),
  microsoftLogin: () => invoke("account:microsoftLogin"),
  launchGame: (settings) => invoke("launch:start", settings),
  getSkinProfile: () => invoke("skin:getProfile"),
  uploadSkin: (payload) => invoke("skin:upload", payload),
  installAeroMenuPack: (payload) => invoke("resourcepack:installAeroMenu", payload),
  onLog: (handler) => ipcRenderer.on("launcher-log", (_event, payload) => handler(payload)),
  onStateUpdated: (handler) => ipcRenderer.on("state-updated", (_event, payload) => handler(payload)),
  onProgress: (handler) => ipcRenderer.on("launcher-progress", (_event, payload) => handler(payload)),
  onClosed: (handler) => ipcRenderer.on("launcher-closed", (_event, payload) => handler(payload))
});
