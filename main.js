const { app, BrowserWindow, ipcMain, nativeImage, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const { Client, Authenticator } = require("minecraft-launcher-core");
const { Auth, tokenUtils } = require("msmc");
const RPC = require("discord-rpc");
const { PNG } = require("pngjs");

const APP_NAME = "Zen Client";
const APP_DIR = path.join(app.getPath("appData"), "ZenClient");
const STATE_FILE = path.join(APP_DIR, "launcher-state.json");
const LEGACY_STATE_FILE = path.join(app.getPath("appData"), "AeroClient", "launcher-state.json");
const DEFAULT_ROOT = path.join(app.getPath("appData"), ".minecraft");
const INSTALLER_DIR = path.join(APP_DIR, "installers");
const DEFAULT_DISCORD_APP_ID = "1496668054803714058";
const ZEN_CLIENT_MOD_FILENAME = "zen-client-fabric.jar";
const ZEN_CLIENT_REQUIRED_MODS = [
  { slug: "fabric-api", label: "Fabric API" }
];

let mainWindow = null;
let launchClient = null;
let discordClient = null;
let discordReady = false;
let discordConnecting = false;
let currentSession = null;
let logBuffer = [];
let updatePollTimer = null;
let currentUpdateState = {
  stage: "idle",
  version: "",
  message: "",
  progressPercent: null,
  action: null,
  visible: false
};
let autoUpdaterRef = null;

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function pickNewestFile(paths) {
  const candidates = paths
    .filter(Boolean)
    .filter((item) => fs.existsSync(item))
    .map((item) => ({ path: item, stat: fs.statSync(item) }));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return candidates[0].path;
}

function defaultState() {
  return {
    accounts: [],
    selectedAccountId: null,
    settings: {
      launchType: "Vanilla",
      minecraftVersion: "",
      minecraftDirectory: DEFAULT_ROOT,
      javaPath: "",
      memoryMb: 4096,
      backgroundPreset: "bamboo",
      discordPresenceEnabled: true,
      discordAppId: DEFAULT_DISCORD_APP_ID,
      discordShowLauncher: true,
      discordShowPlaying: true
    },
    log: []
  };
}

function loadState() {
  ensureDir(APP_DIR);
  if (!fs.existsSync(STATE_FILE) && fs.existsSync(LEGACY_STATE_FILE)) {
    try {
      fs.copyFileSync(LEGACY_STATE_FILE, STATE_FILE);
    } catch {
      // ignore migration errors
    }
  }
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (raw && typeof raw === "object") {
      // Logs are session-only: never load them from disk.
      delete raw.log;
    }
    const merged = {
      ...defaultState(),
      ...raw,
      settings: {
        ...defaultState().settings,
        ...(raw.settings || {})
      }
    };
    // Ensure a default Discord App ID exists so Rich Presence works out of the box.
    if (!String(merged.settings.discordAppId || "").trim()) {
      merged.settings.discordAppId = DEFAULT_DISCORD_APP_ID;
    }
    return merged;
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  ensureDir(APP_DIR);
  const copy = { ...(state || {}) };
  // Logs are session-only: never persist them.
  delete copy.log;
  fs.writeFileSync(STATE_FILE, JSON.stringify(copy, null, 2), "utf8");
}

function appendLog(message) {
  logBuffer = [...logBuffer, message].slice(-200);
  sendEvent("launcher-log", { message });
}

function setUpdateState(patch) {
  currentUpdateState = {
    ...currentUpdateState,
    ...patch
  };
  sendEvent("update-status", currentUpdateState);
}

function sendEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function zenIconDataUrl() {
  // Concentric circle icon used across launcher branding.
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#0a0a0a"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="#f4f4f4" stroke-width="7"/>
    <circle cx="32" cy="32" r="10" fill="none" stroke="#f4f4f4" stroke-width="7"/>
    <circle cx="32" cy="32" r="4.5" fill="#f4f4f4"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

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

function createWindow() {
  const icon = nativeImage.createFromDataURL(zenIconDataUrl());

  // Remove the top menu bar (File/Edit/...) on Windows/Linux.
  try {
    Menu.setApplicationMenu(null);
  } catch {
    // ignore
  }

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: "#050505",
    title: APP_NAME,
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    mainWindow.setMenuBarVisibility(false);
  } catch {
    // ignore
  }

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  if (process.env.AERO_SMOKE_TEST === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      }, 1800);
    });
  }
}

function initAutoUpdater() {
  // Auto-updater only makes sense for packaged installer builds.
  if (!app.isPackaged) return;

  try {
    ({ autoUpdater: autoUpdaterRef } = require("electron-updater"));
  } catch (error) {
    appendLog(`[update] Auto-updater unavailable: ${error?.message || String(error)}`);
    return;
  }

  autoUpdaterRef.autoDownload = false;
  autoUpdaterRef.logger = null;
  let updateDownloadStarted = false;

  autoUpdaterRef.on("checking-for-update", () => {
    setUpdateState({
      stage: "checking",
      visible: false,
      action: null,
      message: "",
      progressPercent: null
    });
  });
  autoUpdaterRef.on("update-available", (info) => {
    setUpdateState({
      stage: "available",
      version: info?.version || "",
      visible: true,
      action: "download",
      message: `Zen Client ${info?.version || "update"} is available.`,
      progressPercent: null
    });
  });
  autoUpdaterRef.on("update-not-available", () => {
    setUpdateState({
      stage: "idle",
      visible: false,
      action: null,
      message: "",
      progressPercent: null
    });
  });
  autoUpdaterRef.on("error", (err) => {
    updateDownloadStarted = false;
    setUpdateState({
      stage: "error",
      visible: true,
      action: null,
      message: `Update problem: ${err?.message || String(err)}`,
      progressPercent: null
    });
  });
  autoUpdaterRef.on("download-progress", (p) => {
    const pct = typeof p?.percent === "number" ? p.percent.toFixed(0) : "?";
    setUpdateState({
      stage: "downloading",
      visible: true,
      action: null,
      message: `Downloading update... ${pct}%`,
      progressPercent: Number.isFinite(Number(p?.percent)) ? Math.round(Number(p.percent)) : null
    });
  });
  autoUpdaterRef.on("update-downloaded", (info) => {
    setUpdateState({
      stage: "downloaded",
      version: info?.version || "",
      visible: true,
      action: "install",
      message: `Zen Client ${info?.version || "update"} is ready to install.`,
      progressPercent: 100
    });
  });

  // Kick off once shortly after the window exists.
  setTimeout(() => {
    autoUpdaterRef.checkForUpdates().catch(() => {});
  }, 2500);

  if (updatePollTimer) clearInterval(updatePollTimer);
  updatePollTimer = setInterval(() => {
    autoUpdaterRef.checkForUpdates().catch(() => {});
  }, 5_000);
}

function sanitizeAccount(account) {
  return {
    id: account.id,
    type: account.type,
    username: account.username,
    uuid: account.uuid,
    title: account.type === "microsoft" ? `${account.username} | Microsoft` : `${account.username} | Offline`
  };
}

function getDiscordActivity(state) {
  const settings = state.settings || {};
  if (!settings.discordPresenceEnabled) return null;
  const now = Date.now();
  const base = { startTimestamp: Math.floor(now / 1000) };

  if (currentSession && settings.discordShowPlaying) {
      const details = `Zen Client - ${currentSession.launchType || "Vanilla"}`;
      let stateLine = `Playing ${currentSession.version || ""}`.trim();
      if (currentSession.phase === "loading_peace") stateLine = "Loading peace...";
      if (currentSession.phase === "giving_peace") stateLine = "Giving you peace...";
      if (currentSession.phase === "enjoy") stateLine = "Enjoy!";
      return {
      ...base,
      details,
      state: stateLine || "In game",
      instance: false
    };
  }

  if (settings.discordShowLauncher) {
    const selected = state.accounts.find((a) => a.id === state.selectedAccountId);
    return {
      ...base,
      details: "In Zen Client",
      state: selected ? `Selected: ${selected.username}` : "Choosing an account",
      instance: false
    };
  }

  return null;
}

function updateSessionPhaseFromLog(line) {
  if (!currentSession) return;
  const text = String(line || "").toLowerCase();
  let next = null;
  if (text.includes("joining server")) {
    next = "enjoy";
  } else if (
    text.includes("loading world") ||
    text.includes("joining world") ||
    text.includes("starting integrated server") ||
    text.includes("preparing spawn area") ||
    text.includes("connecting to")
  ) {
    next = "loading_peace";
  } else if (text.includes("generating terrain") || text.includes("loading terrain")) {
    next = "giving_peace";
  }
  if (next && currentSession.phase !== next) {
    currentSession.phase = next;
    setDiscordPresence();
  }
}

async function setDiscordPresence() {
  const state = loadState();
  const settings = state.settings || {};
  const clientId = String(settings.discordAppId || DEFAULT_DISCORD_APP_ID || "").trim();
  const activity = getDiscordActivity(state);

  if (!activity || !clientId) {
    if (discordClient && discordReady) {
      try {
        await discordClient.clearActivity();
      } catch {
        // ignore
      }
    }
    return;
  }

  if (discordConnecting) return;
  if (!discordClient) {
    discordClient = new RPC.Client({ transport: "ipc" });
    discordClient.on("ready", () => {
      discordReady = true;
      appendLog("[discord] Connected.");
    });
    discordClient.on("disconnected", () => {
      discordReady = false;
      appendLog("[discord] Disconnected.");
    });
  }

  if (!discordReady) {
    discordConnecting = true;
    try {
      await discordClient.login({ clientId });
    } catch (error) {
      appendLog(`[discord] Could not connect: ${error.message || error}`);
      discordReady = false;
    } finally {
      discordConnecting = false;
    }
  }

  if (discordReady) {
    try {
      await discordClient.setActivity(activity);
    } catch (error) {
      appendLog(`[discord] Could not set activity: ${error.message || error}`);
    }
  }
}

function getClientState() {
  const state = loadState();
  return {
    accounts: state.accounts.map(sanitizeAccount),
    selectedAccountId: state.selectedAccountId,
    settings: state.settings,
    log: logBuffer,
    updateStatus: currentUpdateState
  };
}

function updateState(mutator) {
  const state = loadState();
  mutator(state);
  saveState(state);
  return state;
}

function upsertAccount(account) {
  const state = updateState((draft) => {
    const index = draft.accounts.findIndex((item) => item.id === account.id || (item.type === account.type && item.uuid === account.uuid));
    if (index >= 0) {
      draft.accounts[index] = { ...draft.accounts[index], ...account };
      draft.selectedAccountId = draft.accounts[index].id;
    } else {
      draft.accounts.push(account);
      draft.selectedAccountId = account.id;
    }
  });
  sendEvent("state-updated", getClientState());
  return state;
}

function removeAccount(accountId) {
  updateState((draft) => {
    draft.accounts = draft.accounts.filter((item) => item.id !== accountId);
    if (draft.selectedAccountId === accountId) {
      draft.selectedAccountId = draft.accounts[0]?.id || null;
    }
  });
  sendEvent("state-updated", getClientState());
}

function selectAccount(accountId) {
  updateState((draft) => {
    draft.selectedAccountId = accountId;
  });
  sendEvent("state-updated", getClientState());
}

function saveSettings(settings) {
  updateState((draft) => {
    draft.settings = {
      ...draft.settings,
      ...settings
    };
  });
  sendEvent("state-updated", getClientState());
  setDiscordPresence();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchVersions() {
  const [manifest, fabricGames, quiltGames] = await Promise.all([
    fetchJson("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"),
    fetchJson("https://meta.fabricmc.net/v2/versions/game"),
    fetchJson("https://meta.quiltmc.org/v3/versions/game")
  ]);

  return {
    vanilla: manifest.versions.filter((item) => item.type === "release").slice(0, 80).map((item) => item.id),
    fabric: fabricGames.filter((item) => item.stable).slice(0, 80).map((item) => item.version).filter((item) => item.startsWith("1.")),
    quilt: quiltGames.filter((item) => item.stable).slice(0, 80).map((item) => item.version).filter((item) => item.startsWith("1."))
  };
}

function createOfflineAccount(username, incomingUuid) {
  const trimmed = String(username || "").trim();
  if (!trimmed) throw new Error("Type a username first.");
  const uuidValue = String(incomingUuid || "").trim() || crypto.randomUUID();
  const account = {
    id: crypto.randomUUID(),
    type: "offline",
    username: trimmed,
    uuid: uuidValue
  };
  upsertAccount(account);
  appendLog(`[account] Saved offline profile for ${trimmed}`);
  return sanitizeAccount(account);
}

async function microsoftSignIn() {
  appendLog("[microsoft] Opening Microsoft sign-in window...");
  const auth = new Auth("select_account");
  auth.on("load", (_code, message) => {
    appendLog(`[microsoft] ${message}`);
  });

  const xbox = await auth.launch("electron", {
    width: 540,
    height: 720,
    resizable: false,
    parent: mainWindow,
    modal: true,
    autoHideMenuBar: true,
    backgroundColor: "#050505",
    title: "Microsoft Sign In"
  });

  const minecraft = await xbox.getMinecraft();
  const mclcToken = minecraft.mclc(true);
  const account = {
    id: crypto.randomUUID(),
    type: "microsoft",
    username: mclcToken.name,
    uuid: mclcToken.uuid,
    mclcToken
  };
  upsertAccount(account);
  appendLog(`[microsoft] Signed in as ${account.username}`);
  return sanitizeAccount(account);
}

async function resolveAuth(account) {
  if (account.type === "microsoft") {
    const auth = new Auth("select_account");
    const minecraft = await tokenUtils.fromMclcToken(auth, account.mclcToken, true);
    const refreshedToken = minecraft.mclc(true);
    updateState((draft) => {
      const target = draft.accounts.find((item) => item.id === account.id);
      if (target) {
        target.username = refreshedToken.name;
        target.uuid = refreshedToken.uuid;
        target.mclcToken = refreshedToken;
      }
    });
    sendEvent("state-updated", getClientState());
    appendLog(`[microsoft] Refreshed sign-in for ${refreshedToken.name}`);
    return refreshedToken;
  }

  return Authenticator.getAuth(account.username);
}

async function resolveMinecraftServicesAccessToken(account) {
  const auth = new Auth("select_account");
  const minecraft = await tokenUtils.fromMclcToken(auth, account.mclcToken, true);
  const refreshedToken = minecraft.mclc(true);
  updateState((draft) => {
    const target = draft.accounts.find((item) => item.id === account.id);
    if (target) {
      target.username = refreshedToken.name;
      target.uuid = refreshedToken.uuid;
      target.mclcToken = refreshedToken;
    }
  });
  sendEvent("state-updated", getClientState());
  return refreshedToken.access_token;
}

function findJavaInDirectory(root) {
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && (entry.name === "java.exe" || entry.name === "javaw.exe")) {
        return fullPath;
      }
    }
  }
  return null;
}

function findJavaExecutable(customPath, minecraftRoot) {
  if (customPath && fs.existsSync(customPath)) return customPath;

  const runtimePath = path.join(minecraftRoot, "runtime");
  const runtimeJava = findJavaInDirectory(runtimePath);
  if (runtimeJava) return runtimeJava;

  if (process.env.JAVA_HOME) {
    const javaHomePath = path.join(process.env.JAVA_HOME, "bin", "java.exe");
    if (fs.existsSync(javaHomePath)) return javaHomePath;
  }

  const programFiles = [
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Java"),
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Eclipse Adoptium"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Java")
  ];

  for (const directory of programFiles) {
    const found = findJavaInDirectory(directory);
    if (found) return found;
  }

  const whereJava = spawnSync("where", ["java"], { encoding: "utf8" });
  if (whereJava.status === 0) {
    const first = whereJava.stdout.split(/\r?\n/).find(Boolean);
    if (first) return first.trim();
  }

  throw new Error("Java was not found. Install Java or the official Minecraft Launcher first, or set a custom Java path.");
}

async function ensureFile(url, targetPath) {
  ensureDir(path.dirname(targetPath));
  if (fs.existsSync(targetPath)) return targetPath;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}

function getVersionInstallInfo(minecraftRoot, versionId) {
  const versionDir = path.join(minecraftRoot, "versions", versionId);
  const jsonPath = path.join(versionDir, `${versionId}.json`);
  const jarPath = path.join(versionDir, `${versionId}.jar`);
  const jsonExists = fs.existsSync(jsonPath);
  const jarExists = fs.existsSync(jarPath);
  const jarSize = jarExists ? fs.statSync(jarPath).size : 0;
  return {
    versionDir,
    jsonPath,
    jarPath,
    jsonExists,
    jarExists,
    jarSize,
    isValid: jsonExists && jarExists && jarSize > 0
  };
}

function repairInheritedVersionJar(minecraftRoot, versionId) {
  const info = getVersionInstallInfo(minecraftRoot, versionId);
  if (!info.jsonExists) return false;
  if (info.jarExists && info.jarSize > 0) return true;

  try {
    const versionJson = JSON.parse(fs.readFileSync(info.jsonPath, "utf8"));
    const inheritedVersion = String(versionJson.inheritsFrom || "").trim();
    if (!inheritedVersion) return false;

    const inheritedJarPath = path.join(minecraftRoot, "versions", inheritedVersion, `${inheritedVersion}.jar`);
    if (!fs.existsSync(inheritedJarPath)) return false;

    const inheritedJarSize = fs.statSync(inheritedJarPath).size;
    if (inheritedJarSize <= 0) return false;

    ensureDir(path.dirname(info.jarPath));
    fs.copyFileSync(inheritedJarPath, info.jarPath);
    appendLog(`[launch] Repaired ${versionId} by copying inherited jar from ${inheritedVersion}.`);
    return true;
  } catch (error) {
    appendLog(`[launch] Could not repair ${versionId}: ${error?.message || String(error)}`);
    return false;
  }
}

function removeBrokenVersionInstall(minecraftRoot, versionId, label) {
  const info = getVersionInstallInfo(minecraftRoot, versionId);
  if (!fs.existsSync(info.versionDir)) return;
  appendLog(`[${label}] Found broken install for ${versionId}; repairing it now.`);
  fs.rmSync(info.versionDir, { recursive: true, force: true });
}

function spawnLogged(command, args, label) {
  return new Promise((resolve, reject) => {
    appendLog(`[${label}] ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => appendLog(`[${label}] ${line}`));
    });
    child.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => appendLog(`[${label}] ${line}`));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function getLatestFabricLoader(mcVersion) {
  const loaders = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
  return loaders[0]?.loader?.version;
}

async function getLatestQuiltLoader(mcVersion) {
  const loaders = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`);
  if (Array.isArray(loaders)) {
    return loaders[0]?.loader?.version;
  }
  return loaders?.loader?.version;
}

async function ensureFabricInstall(minecraftRoot, javaPath, minecraftVersion) {
  const loaderVersion = await getLatestFabricLoader(minecraftVersion);
  if (!loaderVersion) throw new Error("Could not find a Fabric loader for that version.");
  const versionId = `fabric-loader-${loaderVersion}-${minecraftVersion}`;
  const installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (installInfo.isValid) return versionId;
  if (repairInheritedVersionJar(minecraftRoot, versionId)) return versionId;
  if (installInfo.jsonExists || installInfo.jarExists) {
    removeBrokenVersionInstall(minecraftRoot, versionId, "fabric");
  }

  const installers = await fetchJson("https://meta.fabricmc.net/v2/versions/installer");
  const installer = installers.find((item) => item.stable) || installers[0];
  if (!installer?.url) throw new Error("Could not find the Fabric installer.");

  const installerPath = path.join(INSTALLER_DIR, `fabric-installer-${installer.version}.jar`);
  await ensureFile(installer.url, installerPath);
  await spawnLogged(javaPath, [
    "-jar",
    installerPath,
    "client",
    "-dir",
    minecraftRoot,
    "-mcversion",
    minecraftVersion,
    "-loader",
    loaderVersion,
    "-noprofile",
    "-snapshot"
  ], "fabric");
  return versionId;
}

async function ensureQuiltInstall(minecraftRoot, javaPath, minecraftVersion) {
  const loaderVersion = await getLatestQuiltLoader(minecraftVersion);
  if (!loaderVersion) throw new Error("Could not find a Quilt loader for that version.");
  const versionId = `quilt-loader-${loaderVersion}-${minecraftVersion}`;
  let installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (installInfo.isValid) return versionId;
  if (repairInheritedVersionJar(minecraftRoot, versionId)) return versionId;
  if (installInfo.jsonExists || installInfo.jarExists) {
    removeBrokenVersionInstall(minecraftRoot, versionId, "quilt");
  }

  const installers = await fetchJson("https://meta.quiltmc.org/v3/versions/installer");
  const installer = installers[0];
  if (!installer?.url) throw new Error("Could not find the Quilt installer.");

  const installerPath = path.join(INSTALLER_DIR, `quilt-installer-${installer.version}.jar`);
  await ensureFile(installer.url, installerPath);
  try {
    await spawnLogged(
      javaPath,
      [
        "-jar",
        installerPath,
        "install",
        "client",
        minecraftVersion,
        loaderVersion,
        `--install-dir=${minecraftRoot}`,
        "--no-profile"
      ],
      "quilt"
    );
  } catch {
    // Some installer versions prefer the split form: --install-dir <path>
    await spawnLogged(
      javaPath,
      ["-jar", installerPath, "install", "client", minecraftVersion, loaderVersion, "--install-dir", minecraftRoot, "--no-profile"],
      "quilt"
    );
  }

  installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (repairInheritedVersionJar(minecraftRoot, versionId)) {
    installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  }
  if (installInfo.isValid) return versionId;

  // Fallback: some installers may choose a slightly different directory name.
  const versionsDir = path.join(minecraftRoot, "versions");
  const candidates = fs.existsSync(versionsDir)
    ? fs
        .readdirSync(versionsDir, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name.startsWith("quilt-loader-") &&
            entry.name.endsWith(`-${minecraftVersion}`) &&
            getVersionInstallInfo(minecraftRoot, entry.name).isValid
        )
        .map((entry) => {
          const full = path.join(versionsDir, entry.name);
          const stat = fs.statSync(full);
          return { name: entry.name, mtime: stat.mtimeMs };
        })
    : [];

  if (candidates.length) {
    candidates.sort((a, b) => b.mtime - a.mtime);
    appendLog(`[quilt] Using installed version ${candidates[0].name} (expected ${versionId})`);
    return candidates[0].name;
  }

  throw new Error("Quilt installed, but the launcher could not find the Quilt version JSON. Check the log above for installer output.");
}

const MODRINTH_BASE_MODS = [
  { slug: "sodium", label: "Sodium" },
  { slug: "iris", label: "Iris Shaders" },
  { slug: "entityculling", label: "Entity Culling" },
  { slug: "ferrite-core", label: "FerriteCore" },
  { slug: "immediatelyfast", label: "ImmediatelyFast" },
  { slug: "lithium", label: "Lithium" },
  { slug: "cloth-config", label: "Cloth Config API" },
  { slug: "modmenu", label: "Mod Menu" }
];

// Extra performance/helpful mods (limit 5, as requested). These are optional: we only install them if a compatible version exists.
const MODRINTH_EXTRA_MODS = [
  { slug: "fabric-api", label: "Fabric API (dependency for many mods)" },
  { slug: "indium", label: "Indium (Sodium compatibility)" },
  { slug: "krypton", label: "Krypton (network optimizations)" },
  { slug: "starlight", label: "Starlight (lighting performance)" },
  { slug: "dynamic-fps", label: "Dynamic FPS (background FPS limiter)" }
];

async function modrinthFetchProjectVersion(slug, minecraftVersion, loader) {
  const encodedGameVersions = encodeURIComponent(JSON.stringify([minecraftVersion]));
  const encodedLoaders = encodeURIComponent(JSON.stringify([loader]));
  const url = `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?game_versions=${encodedGameVersions}&loaders=${encodedLoaders}`;
  const versions = await fetchJson(url);
  return Array.isArray(versions) ? versions[0] : null;
}

async function modrinthPickDownload(slug, minecraftVersion, launchType) {
  const preferQuilt = String(launchType || "").toLowerCase() === "quilt";
  const first = preferQuilt ? await modrinthFetchProjectVersion(slug, minecraftVersion, "quilt") : null;
  const version = first || (await modrinthFetchProjectVersion(slug, minecraftVersion, "fabric"));
  const files = Array.isArray(version?.files) ? version.files : [];
  const primary = files.find((f) => f?.primary) || files[0];
  if (!primary?.url) return null;
  return { url: primary.url, filename: primary.filename || `${slug}.jar` };
}

async function ensureModrinthMods(minecraftRoot, minecraftVersion, launchType) {
  const selected = String(launchType || "").toLowerCase();
  if (selected !== "fabric" && selected !== "quilt") return;
  if (selected === "quilt") {
    appendLog("[mods] Skipping automatic performance mod pack for Quilt to avoid loader compatibility issues.");
    return;
  }

  const modsDir = path.join(minecraftRoot, "mods");
  ensureDir(modsDir);

  const wanted = [...MODRINTH_BASE_MODS, ...MODRINTH_EXTRA_MODS];
  for (const mod of wanted) {
    const slug = mod.slug;
    const label = mod.label || slug;
    const target = path.join(modsDir, `${slug}.jar`);
    if (fs.existsSync(target)) continue;

    try {
      appendLog(`[mods] Resolving ${label}...`);
      const download = await modrinthPickDownload(slug, minecraftVersion, launchType);
      if (!download) {
        appendLog(`[mods] No compatible Modrinth file found for ${label} (${minecraftVersion}, ${selected}). Skipping.`);
        continue;
      }
      await ensureFile(download.url, target);
      appendLog(`[mods] Installed ${label} -> ${path.basename(target)}`);
    } catch (error) {
      appendLog(`[mods] Failed to install ${label}: ${error?.message || String(error)}`);
    }
  }
}

async function ensureZenClientDependencies(minecraftRoot, minecraftVersion, launchType) {
  const selected = String(launchType || "").toLowerCase();
  if (selected !== "fabric" && selected !== "quilt") return;

  const modsDir = path.join(minecraftRoot, "mods");
  ensureDir(modsDir);

  for (const mod of ZEN_CLIENT_REQUIRED_MODS) {
    const target = path.join(modsDir, `${mod.slug}.jar`);
    if (fs.existsSync(target)) continue;

    try {
      appendLog(`[zen-mod] Resolving dependency ${mod.label}...`);
      const download = await modrinthPickDownload(mod.slug, minecraftVersion, launchType);
      if (!download) {
        appendLog(`[zen-mod] No compatible ${mod.label} build was found for ${selected} ${minecraftVersion}.`);
        continue;
      }
      await ensureFile(download.url, target);
      appendLog(`[zen-mod] Installed dependency ${mod.label} -> ${path.basename(target)}`);
    } catch (error) {
      appendLog(`[zen-mod] Failed to install dependency ${mod.label}: ${error?.message || String(error)}`);
    }
  }
}

function resolveBundledZenClientModPath() {
  const directCandidates = [
    app.isPackaged ? path.join(process.resourcesPath, "bundled-mods", ZEN_CLIENT_MOD_FILENAME) : null,
    path.join(__dirname, "bundled-mods", ZEN_CLIENT_MOD_FILENAME)
  ];

  const direct = pickNewestFile(directCandidates);
  if (direct) return direct;

  const devLibsDir = path.join(__dirname, "zen-client-mod", "build", "libs");
  if (!fs.existsSync(devLibsDir)) return null;

  const jars = fs
    .readdirSync(devLibsDir)
    .filter((file) => file.endsWith(".jar"))
    .filter((file) => !file.endsWith("-sources.jar"))
    .filter((file) => !file.endsWith("-dev.jar"))
    .map((file) => path.join(devLibsDir, file));

  return pickNewestFile(jars);
}

async function ensureZenClientMod(minecraftRoot, launchType) {
  const selected = String(launchType || "").toLowerCase();
  if (selected !== "fabric" && selected !== "quilt") return;

  const source = resolveBundledZenClientModPath();
  if (!source) {
    appendLog("[zen-mod] No bundled Zen Client mod was found. Skipping auto-install.");
    return;
  }

  const modsDir = path.join(minecraftRoot, "mods");
  ensureDir(modsDir);
  const target = path.join(modsDir, ZEN_CLIENT_MOD_FILENAME);

  const sourceStat = fs.statSync(source);
  const targetStat = fs.existsSync(target) ? fs.statSync(target) : null;
  const needsCopy =
    !targetStat ||
    targetStat.size !== sourceStat.size ||
    Math.abs(targetStat.mtimeMs - sourceStat.mtimeMs) > 1000;

  if (!needsCopy) return;

  fs.copyFileSync(source, target);
  try {
    fs.utimesSync(target, sourceStat.atime, sourceStat.mtime);
  } catch {
    // ignore timestamp sync failures
  }
  appendLog(`[zen-mod] Installed bundled Zen Client mod for ${selected} -> ${path.basename(target)}`);
}

async function launchGame(settings) {
  const state = loadState();
  const account = state.accounts.find((item) => item.id === state.selectedAccountId);
  if (!account) throw new Error("Choose an account first.");

  const minecraftRoot = settings.minecraftDirectory || DEFAULT_ROOT;
  ensureDir(minecraftRoot);

  const authorization = await resolveAuth(account);
  const javaPath = findJavaExecutable(settings.javaPath, minecraftRoot);
  appendLog(`[launch] Using Java at ${javaPath}`);

  let customVersion = null;
  const selectedType = settings.launchType || "Vanilla";
  const selectedVersion = settings.minecraftVersion;
  if (!selectedVersion) throw new Error("Pick a Minecraft version first.");

  if (selectedType === "Fabric") {
    customVersion = await ensureFabricInstall(minecraftRoot, javaPath, selectedVersion);
  } else if (selectedType === "Quilt") {
    customVersion = await ensureQuiltInstall(minecraftRoot, javaPath, selectedVersion);
  }

  await ensureZenClientDependencies(minecraftRoot, selectedVersion, selectedType);
  await ensureZenClientMod(minecraftRoot, selectedType);
  // Auto-install requested performance mods for Fabric/Quilt.
  await ensureModrinthMods(minecraftRoot, selectedVersion, selectedType);

  updateState((draft) => {
    draft.settings = {
      ...draft.settings,
      ...settings,
      javaPath: settings.javaPath || draft.settings.javaPath
    };
  });
  sendEvent("state-updated", getClientState());

  launchClient = new Client();
  launchClient.on("debug", (data) => appendLog(String(data)));
  launchClient.on("data", (data) => {
    const line = String(data || "").trim();
    if (line) updateSessionPhaseFromLog(line);
    appendLog(line);
  });
  launchClient.on("download", (data) => appendLog(`[download] ${data}`));
  launchClient.on("progress", (data) => {
    if (data?.task && typeof data.total === "number" && typeof data.current === "number") {
      sendEvent("launcher-progress", data);
    }
  });
  launchClient.on("close", (code) => {
    appendLog(`[launch] Minecraft closed with exit code ${code}`);
    sendEvent("launcher-closed", { code });
    currentSession = null;
    setDiscordPresence();
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } catch {
        // ignore
      }
    }
  });

  const launchOptions = {
    authorization,
    root: minecraftRoot,
    version: {
      number: selectedVersion,
      type: "release",
      ...(customVersion ? { custom: customVersion } : {})
    },
    memory: {
      max: `${settings.memoryMb || 4096}M`,
      min: "1024M"
    },
    javaPath,
    overrides: {
      detached: false
    }
  };

  appendLog(`[launch] Starting ${selectedType} ${selectedVersion}${customVersion ? ` as ${customVersion}` : ""}`);
  currentSession = {
    launchType: selectedType,
    version: selectedVersion,
    username: account.username,
    phase: null
  };
  setDiscordPresence();

  // Keep the launcher out of the way while Minecraft is running.
  if (mainWindow && !mainWindow.isDestroyed() && (selectedType === "Fabric" || selectedType === "Quilt")) {
    try {
      mainWindow.minimize();
    } catch {
      // ignore
    }
  }

  const proc = await launchClient.launch(launchOptions);
  if (!proc) {
    currentSession = null;
    setDiscordPresence();
    throw new Error("Minecraft did not start. Check the built-in log for the Java or launcher error.");
  }
  return true;
}

function pngFromPalette(width, height, backgroundTop, backgroundBottom, bubblesSeed) {
  const png = new PNG({ width, height });
  const top = hexToRgb(backgroundTop);
  const bottom = hexToRgb(backgroundBottom);

  for (let y = 0; y < height; y++) {
    const ratio = y / Math.max(height - 1, 1);
    const r = Math.round(top.r + (bottom.r - top.r) * ratio);
    const g = Math.round(top.g + (bottom.g - top.g) * ratio);
    const b = Math.round(top.b + (bottom.b - top.b) * ratio);
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }

  // Zen theme: no bubble overlay (kept intentionally simple/clean).

  return png;
}

function hexToRgb(value) {
  const raw = value.replace("#", "");
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16)
  };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function drawBubble(png, cx, cy, radius, alpha) {
  const { width, height } = png;
  const minX = Math.max(0, cx - radius - 2);
  const maxX = Math.min(width - 1, cx + radius + 2);
  const minY = Math.max(0, cy - radius - 2);
  const maxY = Math.min(height - 1, cy + radius + 2);
  const outline = { r: 210, g: 248, b: 255 };
  const fill = { r: 255, g: 255, b: 255 };

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius + 1) continue;
      const edge = Math.abs(dist - radius);
      const isOutline = edge < 1.25;
      const strength = isOutline ? 0.65 : 0.18;
      const a = alpha * strength;
      const idx = (width * y + x) << 2;
      const src = isOutline ? outline : fill;
      png.data[idx] = Math.round(png.data[idx] * (1 - a) + src.r * a);
      png.data[idx + 1] = Math.round(png.data[idx + 1] * (1 - a) + src.g * a);
      png.data[idx + 2] = Math.round(png.data[idx + 2] * (1 - a) + src.b * a);
    }
  }
}

function writePng(filePath, png) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function randomBoundary() {
  return `----AeroBoundary${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function buildMultipartBody(fields, fileField) {
  const boundary = randomBoundary();
  const chunks = [];

  for (const [name, value] of Object.entries(fields || {})) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(String(value)));
    chunks.push(Buffer.from("\r\n"));
  }

  if (fileField) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\n` +
          `Content-Type: ${fileField.contentType}\r\n\r\n`
      )
    );
    chunks.push(fileField.bytes);
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function installAeroMenuResourcePack(minecraftRoot, preset) {
  const packName = "Zen_Menu";
  const packRoot = path.join(minecraftRoot, "resourcepacks", packName);
  const assetsRoot = path.join(packRoot, "assets", "minecraft", "textures", "gui", "title", "background");
  ensureDir(assetsRoot);

  const palette = {
    ink: { top: "#07120c", bottom: "#173224", seed: 12 },
    stone: { top: "#111515", bottom: "#2d3432", seed: 48 },
    bamboo: { top: "#112316", bottom: "#46663f", seed: 96 }
  }[preset] || { top: "#07120c", bottom: "#173224", seed: 12 };

  for (let i = 0; i < 6; i++) {
    const png = pngFromPalette(512, 512, palette.top, palette.bottom, palette.seed + i * 17);
    writePng(path.join(assetsRoot, `panorama_${i}.png`), png);
  }

  const icon = pngFromPalette(64, 64, palette.top, palette.bottom, palette.seed + 777);
  writePng(path.join(packRoot, "pack.png"), icon);
  writeText(
    path.join(packRoot, "pack.mcmeta"),
    JSON.stringify(
      {
        pack: {
          pack_format: 15,
          description: "Zen Client menu panorama"
        }
      },
      null,
      2
    )
  );
  return packRoot;
}

ipcMain.handle("state:get", async () => getClientState());
ipcMain.handle("versions:get", async () => fetchVersions());
ipcMain.handle("settings:save", async (_event, settings) => {
  saveSettings(settings);
  return getClientState();
});
ipcMain.handle("account:addOffline", async (_event, payload) => createOfflineAccount(payload.username, payload.uuid));
ipcMain.handle("account:remove", async (_event, accountId) => {
  removeAccount(accountId);
  return getClientState();
});
ipcMain.handle("account:select", async (_event, accountId) => {
  selectAccount(accountId);
  return getClientState();
});
ipcMain.handle("account:microsoftLogin", async () => {
  const account = await microsoftSignIn();
  return {
    account,
    state: getClientState()
  };
});
ipcMain.handle("launch:start", async (_event, settings) => {
  try {
    await launchGame(settings);
    return true;
  } catch (error) {
    const message = formatInvokeError(error);
    appendLog(`[launch] Failed to start: ${message}`);
    throw new Error(message);
  }
});

ipcMain.handle("shell:openExternal", async (_event, url) => {
  const target = String(url || "").trim();
  if (!target) throw new Error("Missing URL.");
  await shell.openExternal(target);
  return true;
});

ipcMain.handle("shell:openFolder", async (_event, payload) => {
  const root = String(payload?.minecraftDirectory || DEFAULT_ROOT).trim() || DEFAULT_ROOT;
  const kind = String(payload?.kind || "mods").trim().toLowerCase();
  const folderName = kind === "resourcepacks" ? "resourcepacks" : "mods";
  const targetDir = path.join(root, folderName);
  ensureDir(targetDir);
  const result = await shell.openPath(targetDir);
  if (result) {
    throw new Error(result);
  }
  return { path: targetDir };
});

ipcMain.handle("library:scanInstalled", async (_event, payload) => {
  const root = String(payload?.minecraftDirectory || DEFAULT_ROOT).trim() || DEFAULT_ROOT;
  const modsDir = path.join(root, "mods");
  const packsDir = path.join(root, "resourcepacks");

  ensureDir(modsDir);
  ensureDir(packsDir);

  const readNames = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => entry.name);

  return {
    mods: readNames(modsDir),
    resourcepacks: readNames(packsDir),
    modsDir,
    packsDir
  };
});

async function modrinthFetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Zen Client"
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Modrinth request failed (${response.status}). ${text}`.trim());
  }
  return response.json();
}

function normalizeLoaderForModrinth(launchType) {
  const normalized = String(launchType || "").toLowerCase();
  if (normalized === "fabric") return "fabric";
  if (normalized === "quilt") return "quilt";
  return "";
}

ipcMain.handle("modrinth:install", async (_event, payload) => {
  const projectId = String(payload?.projectId || "").trim();
  const projectType = String(payload?.projectType || "").trim();
  const minecraftRoot = String(payload?.minecraftDirectory || DEFAULT_ROOT).trim() || DEFAULT_ROOT;
  const minecraftVersion = String(payload?.minecraftVersion || "").trim();
  const launchType = String(payload?.launchType || "").trim();

  if (!projectId) throw new Error("Missing Modrinth project id.");
  if (projectType !== "mod" && projectType !== "resourcepack") throw new Error("Unsupported project type.");
  if (!minecraftVersion) throw new Error("Pick a Minecraft version first.");

  const loader = normalizeLoaderForModrinth(launchType);
  if (projectType === "mod" && !loader) {
    throw new Error("Switch Launch type to Fabric or Quilt to install mods.");
  }

  if (projectType === "mod" && !minecraftVersion) {
    throw new Error("Pick a Minecraft version first.");
  }

  const versionsUrl = new URL(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`);
  if (projectType === "mod") {
    versionsUrl.searchParams.set("game_versions", JSON.stringify([minecraftVersion]));
    versionsUrl.searchParams.set("loaders", JSON.stringify([loader]));
  }

  let versions = await modrinthFetchJson(versionsUrl.toString());
  if (!Array.isArray(versions) || versions.length === 0) {
    // Fallback: try without loader/game filters (still picks latest).
    const fallbackUrl = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`;
    versions = await modrinthFetchJson(fallbackUrl);
  }

  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("No compatible versions found on Modrinth for your selected settings.");
  }

  const chosen = versions[0];
  const files = Array.isArray(chosen?.files) ? chosen.files : [];
  const file = files.find((f) => f?.primary) || files[0];
  const fileUrl = String(file?.url || "").trim();
  const fileName = path.basename(String(file?.filename || "").trim() || "download.bin");
  if (!fileUrl) throw new Error("No downloadable file returned by Modrinth.");

  const targetDir = projectType === "mod" ? path.join(minecraftRoot, "mods") : path.join(minecraftRoot, "resourcepacks");
  ensureDir(targetDir);
  const outPath = path.join(targetDir, fileName);

  appendLog(`[modrinth] Downloading ${projectType} ${projectId} -> ${outPath}`);
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  appendLog(`[modrinth] Installed ${fileName}`);
  return { path: outPath, fileName };
});

ipcMain.handle("update:startDownload", async () => {
  if (!autoUpdaterRef) throw new Error("Auto-update is only available in the installed build.");
  setUpdateState({
    stage: "downloading",
    visible: true,
    action: null,
    message: "Downloading update...",
    progressPercent: 0
  });
  await autoUpdaterRef.downloadUpdate();
  return true;
});

ipcMain.handle("update:installNow", async () => {
  if (!autoUpdaterRef) throw new Error("Auto-update is only available in the installed build.");
  setUpdateState({
    stage: "installing",
    visible: true,
    action: null,
    message: "Installing update...",
    progressPercent: 100
  });
  autoUpdaterRef.quitAndInstall();
  return true;
});

ipcMain.handle("skin:getProfile", async () => {
  try {
    const state = loadState();
    const account = state.accounts.find((item) => item.id === state.selectedAccountId);
    if (!account) throw new Error("Choose an account first.");
    if (account.type !== "microsoft") throw new Error("Skin changing only works for Microsoft accounts.");

    let accessToken = "";
    try {
      accessToken = await resolveMinecraftServicesAccessToken(account);
    } catch (error) {
      throw new Error(`Could not load skin profile (session expired). Click 'Sign in with Microsoft' again. (${formatInvokeError(error)})`);
    }

    const response = await fetch("https://api.minecraftservices.com/minecraft/profile", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Could not load skin profile (session expired). Click 'Sign in with Microsoft' again.");
      }
      const text = await response.text().catch(() => "");
      throw new Error(`Could not load skin profile (${response.status}). ${text}`.trim());
    }
    return response.json();
  } catch (error) {
    throw new Error(formatInvokeError(error));
  }
});

ipcMain.handle("skin:upload", async (_event, payload) => {
  try {
    const state = loadState();
    const account = state.accounts.find((item) => item.id === state.selectedAccountId);
    if (!account) throw new Error("Choose an account first.");
    if (account.type !== "microsoft") throw new Error("Skin changing only works for Microsoft accounts.");

    const variant = payload?.variant === "slim" ? "slim" : "classic";
    const bytes = payload?.bytes;
    if (!bytes || !Array.isArray(bytes) || bytes.length < 24) throw new Error("Invalid skin file.");
    if (bytes.length > 3_000_000) throw new Error("Skin file is too large.");

    const fileBytes = Buffer.from(bytes);
    const header = fileBytes.subarray(0, 8);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!header.equals(pngMagic)) throw new Error("Skin must be a PNG file.");

    let accessToken = "";
    try {
      accessToken = await resolveMinecraftServicesAccessToken(account);
    } catch (error) {
      throw new Error(`Skin upload failed (session expired). Click 'Sign in with Microsoft' again. (${formatInvokeError(error)})`);
    }

    const { body, contentType } = buildMultipartBody(
      { variant },
      {
        name: "file",
        filename: "skin.png",
        contentType: "image/png",
        bytes: fileBytes
      }
    );

    const response = await fetch("https://api.minecraftservices.com/minecraft/profile/skins", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType
      },
      body
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Skin upload failed (${response.status}). ${text}`.trim());
    }
    appendLog(`[skin] Uploaded ${variant} skin for ${account.username}`);
    return true;
  } catch (error) {
    throw new Error(formatInvokeError(error));
  }
});

ipcMain.handle("resourcepack:installAeroMenu", async (_event, payload) => {
  const state = loadState();
  const root = String(payload?.minecraftDirectory || state.settings.minecraftDirectory || DEFAULT_ROOT);
  const preset = String(payload?.preset || state.settings.backgroundPreset || "ink");
  ensureDir(root);
  const packRoot = installAeroMenuResourcePack(root, preset);
  appendLog(`[resourcepack] Installed Zen Menu pack at ${packRoot}`);
  return { packRoot };
});

app.whenReady().then(() => {
  ensureDir(APP_DIR);
  ensureDir(INSTALLER_DIR);
  createWindow();
  initAutoUpdater();
  setDiscordPresence();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
