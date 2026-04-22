const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aeroApi", {
  getState: () => ipcRenderer.invoke("state:get"),
  getVersions: () => ipcRenderer.invoke("versions:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  addOfflineAccount: (payload) => ipcRenderer.invoke("account:addOffline", payload),
  removeAccount: (accountId) => ipcRenderer.invoke("account:remove", accountId),
  selectAccount: (accountId) => ipcRenderer.invoke("account:select", accountId),
  microsoftLogin: () => ipcRenderer.invoke("account:microsoftLogin"),
  launchGame: (settings) => ipcRenderer.invoke("launch:start", settings),
  getSkinProfile: () => ipcRenderer.invoke("skin:getProfile"),
  uploadSkin: (payload) => ipcRenderer.invoke("skin:upload", payload),
  installAeroMenuPack: (payload) => ipcRenderer.invoke("resourcepack:installAeroMenu", payload),
  onLog: (handler) => ipcRenderer.on("launcher-log", (_event, payload) => handler(payload)),
  onStateUpdated: (handler) => ipcRenderer.on("state-updated", (_event, payload) => handler(payload)),
  onProgress: (handler) => ipcRenderer.on("launcher-progress", (_event, payload) => handler(payload)),
  onClosed: (handler) => ipcRenderer.on("launcher-closed", (_event, payload) => handler(payload))
});
