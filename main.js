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
const APP_ID = "com.eddyplaysrizz467.zenclient";
const APP_DIR = path.join(app.getPath("appData"), "ZenClient");
const CACHE_DIR = path.join(APP_DIR, "cache");
const STATE_FILE = path.join(APP_DIR, "launcher-state.json");
const LEGACY_STATE_FILE = path.join(app.getPath("appData"), "AeroClient", "launcher-state.json");
const DEFAULT_ROOT = path.join(app.getPath("appData"), ".minecraft");
const INSTALLER_DIR = path.join(APP_DIR, "installers");
const OPTIMIZATION_DIR = path.join(APP_DIR, "optimizations");
const OPTIMIZATION_STATE_FILE = path.join(OPTIMIZATION_DIR, "applied.json");
const OPTIMIZATION_HISTORY_FILE = path.join(OPTIMIZATION_DIR, "history.log");
const DEFAULT_DISCORD_APP_ID = "1496668054803714058";
const ZEN_CLIENT_BUNDLE_MANIFEST_FILENAME = "zen-client-bundles.json";
const ZEN_CLIENT_MOD_FILENAME = "zen-client-fabric.jar";
const ZEN_CLIENT_MOD_FILENAME_TEMPLATE = "zen-client-fabric-%VERSION%.jar";
const AUTH_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const ZEN_CLIENT_REQUIRED_MOD_LABELS = {
  "fabric-api": "Fabric API"
};

let mainWindow = null;
let launchClient = null;
let discordClient = null;
let discordReady = false;
let discordConnecting = false;
let currentSession = null;
let currentLaunchContext = null;
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
let lastLoggedMessage = "";
let lastLoggedAt = 0;
let updateDownloadStarted = false;
let updateLastProgressAt = 0;

if (process.platform === "win32") {
  try {
    app.setAppUserModelId(APP_ID);
  } catch {
    // ignore
  }
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function cacheFilePath(key) {
  const safe = String(key || "default")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return path.join(CACHE_DIR, `${safe || "default"}.json`);
}

function readCacheEntry(key, maxAgeMs) {
  try {
    const target = cacheFilePath(key);
    if (!fs.existsSync(target)) return null;
    const stat = fs.statSync(target);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

function writeCacheEntry(key, value) {
  try {
    ensureDir(CACHE_DIR);
    fs.writeFileSync(cacheFilePath(key), JSON.stringify(value), "utf8");
  } catch {
    // ignore cache write failures
  }
}

function sanitizePathSegment(value, fallback = "default") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function resolveInstanceRoot(baseRoot, launchType, minecraftVersion) {
  const root = String(baseRoot || DEFAULT_ROOT).trim() || DEFAULT_ROOT;
  const loader = String(launchType || "vanilla").trim().toLowerCase();
  const version = sanitizePathSegment(minecraftVersion, "latest");

  if (loader === "fabric" || loader === "quilt" || loader === "forge" || loader === "neoforge") {
    return path.join(root, "zen-instances", loader, version);
  }

  return root;
}

function instanceManifestPath(minecraftRoot) {
  return path.join(minecraftRoot, "zen-modrinth-installs.json");
}

function readInstanceManifest(minecraftRoot) {
  try {
    const target = instanceManifestPath(minecraftRoot);
    if (!fs.existsSync(target)) return {};
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeInstanceManifest(minecraftRoot, manifest) {
  try {
    ensureDir(minecraftRoot);
    fs.writeFileSync(instanceManifestPath(minecraftRoot), JSON.stringify(manifest, null, 2), "utf8");
  } catch {
    // ignore manifest write failures
  }
}

function recordInstalledModrinthFile(minecraftRoot, fileName, meta) {
  const manifest = readInstanceManifest(minecraftRoot);
  manifest[fileName] = {
    ...manifest[fileName],
    ...meta,
    recordedAt: new Date().toISOString()
  };
  writeInstanceManifest(minecraftRoot, manifest);
}

function parseMinecraftVersionHints(fileName) {
  const matches = String(fileName || "").match(/1\.\d+(?:\.\d+)?/g);
  return Array.from(new Set(matches || []));
}

function modLooksIncompatible(fileName, selectedVersion, selectedLoader, manifestEntry) {
  const lower = String(fileName || "").toLowerCase();
  const loader = String(selectedLoader || "").toLowerCase();
  const version = String(selectedVersion || "").trim();

  if ((loader === "fabric" || loader === "quilt") && (lower.includes("forge") || lower.includes("neoforge"))) {
    return "wrong loader";
  }
  if ((loader === "forge" || loader === "neoforge") && (lower.includes("fabric") || lower.includes("quilt"))) {
    return "wrong loader";
  }

  if (process.platform === "win32" && lower.includes("cwb-fabric")) {
    return "disabled for safe video mode on Windows";
  }

  if (manifestEntry?.projectType === "mod") {
    if (manifestEntry.loader && String(manifestEntry.loader).toLowerCase() !== loader) {
      return "installed for another loader";
    }
    if (manifestEntry.minecraftVersion && String(manifestEntry.minecraftVersion) !== version) {
      return "installed for another Minecraft version";
    }
  }

  const versionHints = parseMinecraftVersionHints(fileName);
  if (versionHints.length) {
    const exactMatch = versionHints.includes(version);
    if (!exactMatch) {
      const majorMinor = version.split(".").slice(0, 2).join(".");
      const nearbyMatch = versionHints.some((hint) => hint === majorMinor || hint.startsWith(`${majorMinor}.`));
      if (!nearbyMatch) {
        return "filename version mismatch";
      }
    }
  }

  return "";
}

function auditInstanceMods(minecraftRoot, selectedVersion, selectedLoader) {
  const modsDir = path.join(minecraftRoot, "mods");
  ensureDir(modsDir);

  const manifest = readInstanceManifest(minecraftRoot);
  const disabledDir = path.join(minecraftRoot, "mods-disabled");
  const quarantined = [];

  for (const entry of fs.readdirSync(modsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".jar")) continue;

    const reason = modLooksIncompatible(entry.name, selectedVersion, selectedLoader, manifest[entry.name]);
    if (!reason) continue;

    ensureDir(disabledDir);
    const fromPath = path.join(modsDir, entry.name);
    let toPath = path.join(disabledDir, entry.name);
    if (fs.existsSync(toPath)) {
      toPath = path.join(disabledDir, `${Date.now()}-${entry.name}`);
    }
    fs.renameSync(fromPath, toPath);
    quarantined.push({ name: entry.name, reason });
    delete manifest[entry.name];
  }

  if (quarantined.length) {
    writeInstanceManifest(minecraftRoot, manifest);
  }

  return quarantined;
}

function ensureSafeVideoMode(minecraftRoot) {
  const optionsPath = path.join(minecraftRoot, "options.txt");
  if (!fs.existsSync(optionsPath)) return false;

  const raw = fs.readFileSync(optionsPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const desired = new Map([
    ["fullscreen", "false"],
    ["overrideWidth", "1280"],
    ["overrideHeight", "720"],
    ["startedCleanly", "true"]
  ]);

  const seen = new Set();
  const nextLines = lines.map((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return line;
    const key = line.slice(0, idx);
    if (!desired.has(key)) return line;
    seen.add(key);
    return `${key}:${desired.get(key)}`;
  });

  for (const [key, value] of desired.entries()) {
    if (!seen.has(key)) nextLines.push(`${key}:${value}`);
  }

  const nextRaw = nextLines.join("\n");
  if (nextRaw === raw) return false;
  fs.writeFileSync(optionsPath, nextRaw, "utf8");
  return true;
}

function readTextIfExists(target) {
  try {
    if (!target || !fs.existsSync(target)) return "";
    return fs.readFileSync(target, "utf8");
  } catch {
    return "";
  }
}

function normalizeModHint(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function moveModToDisabled(minecraftRoot, fileName, reason) {
  const modsDir = path.join(minecraftRoot, "mods");
  const source = path.join(modsDir, fileName);
  if (!fs.existsSync(source)) return null;

  const disabledDir = path.join(minecraftRoot, "mods-disabled");
  ensureDir(disabledDir);
  let target = path.join(disabledDir, fileName);
  if (fs.existsSync(target)) {
    target = path.join(disabledDir, `${Date.now()}-${fileName}`);
  }
  fs.renameSync(source, target);

  const manifest = readInstanceManifest(minecraftRoot);
  delete manifest[fileName];
  writeInstanceManifest(minecraftRoot, manifest);
  return { name: fileName, reason };
}

function findInstalledModJar(modsDir, hint) {
  if (!hint || !fs.existsSync(modsDir)) return "";
  const wanted = normalizeModHint(hint);
  const entries = fs.readdirSync(modsDir).filter((name) => name.toLowerCase().endsWith(".jar"));
  return entries.find((name) => normalizeModHint(name).includes(wanted)) || "";
}

function recoverFromLaunchCrash(minecraftRoot, exitCode) {
  if (!minecraftRoot || !fs.existsSync(minecraftRoot)) return [];

  const crashyExitCodes = new Set([1, 3221225477, -1073741819]);
  if (!crashyExitCodes.has(Number(exitCode))) return [];

  const latestLog = readTextIfExists(path.join(minecraftRoot, "logs", "latest.log"));
  const hsErrNames = fs.readdirSync(minecraftRoot).filter((name) => /^hs_err_pid\d+\.log$/i.test(name));
  const newestHsErr = pickNewestFile(hsErrNames.map((name) => path.join(minecraftRoot, name)));
  const hsErr = readTextIfExists(newestHsErr);
  const combined = `${latestLog}\n${hsErr}`;
  if (!combined.trim()) return [];

  const modsDir = path.join(minecraftRoot, "mods");
  const recoveries = [];
  const seen = new Set();

  const queueRecovery = (hint, reason) => {
    const jar = findInstalledModJar(modsDir, hint);
    if (!jar) return;
    const key = jar.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    recoveries.push({ jar, reason });
  };

  if (/Mod meteor-client added a lightmap caching hook/i.test(combined) && /badoptimizations/i.test(combined)) {
    queueRecovery("badoptimizations", "conflicts with meteor-client startup hooks");
  }
  if (/EXCEPTION_ACCESS_VIOLATION/i.test(combined) && /glfw\.dll/i.test(combined) && /iris/i.test(combined)) {
    queueRecovery("iris", "suspected graphics startup crash");
  }
  if (/meteor-client-baritone\.mixins\.json:ComeCommandMixin from mod meteor-client/i.test(combined)) {
    queueRecovery("meteor-client", "reported startup mixin mismatch");
  }
  if (/streak-addon/i.test(combined) && recoveries.some((item) => item.jar.toLowerCase().includes("meteor"))) {
    queueRecovery("streak-addon", "depends on the removed meteor stack");
  }

  const moved = [];
  for (const item of recoveries.slice(0, 2)) {
    const result = moveModToDisabled(minecraftRoot, item.jar, item.reason);
    if (result) moved.push(result);
  }
  return moved;
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

function readOptimizationState() {
  try {
    if (!fs.existsSync(OPTIMIZATION_STATE_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(OPTIMIZATION_STATE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOptimizationState(state) {
  ensureDir(OPTIMIZATION_DIR);
  fs.writeFileSync(OPTIMIZATION_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function appendOptimizationHistory(entry) {
  try {
    ensureDir(OPTIMIZATION_DIR);
    fs.appendFileSync(OPTIMIZATION_HISTORY_FILE, `${JSON.stringify({ ...entry, timestamp: new Date().toISOString() })}\n`, "utf8");
  } catch {
    // ignore optimization history failures
  }
}

function optimizationRecordKey(definitionId, minecraftRoot) {
  return `${definitionId}::${String(minecraftRoot || "").toLowerCase()}`;
}

function readKeyValueFile(filePath) {
  if (!fs.existsSync(filePath)) return { lines: [], map: new Map() };
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const map = new Map();
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    map.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return { lines, map };
}

function writePatchedKeyValueFile(filePath, desiredMap = {}, removedKeys = []) {
  ensureDir(path.dirname(filePath));
  const desired = new Map(Object.entries(desiredMap).map(([key, value]) => [String(key), String(value)]));
  const removals = new Set((removedKeys || []).map((key) => String(key)));
  const existing = readKeyValueFile(filePath);
  const seen = new Set();
  const nextLines = existing.lines.map((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return line;
    const key = line.slice(0, idx);
    if (removals.has(key)) {
      seen.add(key);
      return null;
    }
    if (!desired.has(key)) return line;
    seen.add(key);
    return `${key}:${desired.get(key)}`;
  }).filter((line) => line !== null);

  for (const [key, value] of desired.entries()) {
    if (!seen.has(key)) nextLines.push(`${key}:${value}`);
  }

  fs.writeFileSync(filePath, nextLines.join("\n"), "utf8");
}

function resolveOptimizationRoot(payload) {
  const state = loadState();
  const settings = {
    ...state.settings,
    ...(payload || {})
  };
  const baseRoot = settings.minecraftDirectory || DEFAULT_ROOT;
  const version = settings.minecraftVersion || state.settings.minecraftVersion || "latest";
  const launchType = settings.launchType || state.settings.launchType || "Vanilla";
  return resolveInstanceRoot(baseRoot, launchType, version);
}

function createOptionOptimization({ id, title, category, key, value, risky = false, riskReason = "", description = "" }) {
  return {
    id,
    title,
    category,
    kind: "option",
    targetFile: "options.txt",
    desiredValues: { [key]: String(value) },
    risky,
    riskReason,
    description
  };
}

function getOptimizationDefinitions() {
  return [
    createOptionOptimization({ id: "safe-windowed-startup", title: "Safe windowed startup", category: "Launch", key: "fullscreen", value: "false", description: "Starts Minecraft windowed first to avoid fullscreen handoff issues." }),
    createOptionOptimization({ id: "safe-window-width", title: "Launch width 1280", category: "Launch", key: "overrideWidth", value: "1280", description: "Uses a safer startup width for the game window." }),
    createOptionOptimization({ id: "safe-window-height", title: "Launch height 720", category: "Launch", key: "overrideHeight", value: "720", description: "Uses a safer startup height for the game window." }),
    createOptionOptimization({ id: "started-cleanly-flag", title: "Mark started cleanly", category: "Launch", key: "startedCleanly", value: "true", description: "Stops Minecraft from retrying stale recovery mode on startup." }),
    createOptionOptimization({ id: "disable-vsync", title: "Disable VSync", category: "Graphics", key: "enableVsync", value: "false", risky: true, riskReason: "Can cause screen tearing on some displays.", description: "Lets the GPU render without waiting for your monitor refresh." }),
    createOptionOptimization({ id: "render-distance-balanced", title: "Balanced render distance", category: "World", key: "renderDistance", value: "8", risky: true, riskReason: "Lowers how far you can see terrain.", description: "Cuts chunk rendering load without making the world too tiny." }),
    createOptionOptimization({ id: "simulation-distance-balanced", title: "Balanced simulation distance", category: "World", key: "simulationDistance", value: "5", risky: true, riskReason: "Farther-away entities and redstone update less often.", description: "Reduces the amount of world simulation running around you." }),
    createOptionOptimization({ id: "entity-distance-medium", title: "Medium entity distance", category: "World", key: "entityDistanceScaling", value: "0.75", risky: true, riskReason: "Far-away entities can pop in later.", description: "Trims entity rendering range for easier GPU work." }),
    createOptionOptimization({ id: "particles-minimal", title: "Minimal particles", category: "Effects", key: "particles", value: "0", description: "Reduces particle spam for steadier frames." }),
    createOptionOptimization({ id: "clouds-off", title: "Turn clouds off", category: "Graphics", key: "renderClouds", value: "\"false\"", description: "Disables cloud rendering to remove one background pass." }),
    createOptionOptimization({ id: "cloud-range-low", title: "Lower cloud range", category: "Graphics", key: "cloudRange", value: "32", risky: true, riskReason: "Clouds may look cut off sooner if you re-enable them.", description: "Keeps cloud draw distance compact." }),
    createOptionOptimization({ id: "weather-radius-trim", title: "Trim weather radius", category: "Effects", key: "weatherRadius", value: "4", description: "Draws rain and snow in a smaller area around you." }),
    createOptionOptimization({ id: "smooth-lighting-off", title: "Disable smooth lighting", category: "Graphics", key: "ao", value: "false", risky: true, riskReason: "World shading will look flatter.", description: "Turns ambient occlusion off to simplify block lighting." }),
    createOptionOptimization({ id: "entity-shadows-off", title: "Disable entity shadows", category: "Graphics", key: "entityShadows", value: "false", description: "Stops rendering dynamic mob and player shadows." }),
    createOptionOptimization({ id: "mipmaps-off", title: "Disable mipmaps", category: "Textures", key: "mipmapLevels", value: "0", risky: true, riskReason: "Distant textures can shimmer more.", description: "Removes extra texture mip levels to lower VRAM work." }),
    createOptionOptimization({ id: "anisotropy-low", title: "Low anisotropic filtering", category: "Textures", key: "maxAnisotropyBit", value: "1", risky: true, riskReason: "Angled textures can look less crisp.", description: "Keeps texture filtering light." }),
    createOptionOptimization({ id: "biome-blend-zero", title: "Disable biome blend", category: "World", key: "biomeBlendRadius", value: "0", risky: true, riskReason: "Biome color transitions will look harsher.", description: "Stops extra biome color smoothing work." }),
    createOptionOptimization({ id: "chunk-fade-off", title: "Disable chunk fade-in", category: "World", key: "chunkSectionFadeInTime", value: "0.0", description: "Skips chunk fade animations to reduce visual overhead." }),
    createOptionOptimization({ id: "cutout-leaves-fast", title: "Fast leaf rendering", category: "Graphics", key: "cutoutLeaves", value: "true", description: "Uses simpler leaf rendering where supported." }),
    createOptionOptimization({ id: "force-unicode-off", title: "Disable force Unicode font", category: "UI", key: "forceUnicodeFont", value: "false", description: "Keeps the lighter default font renderer active." }),
    createOptionOptimization({ id: "fov-effects-off", title: "Disable FOV effects", category: "Effects", key: "fovEffectScale", value: "0.0", description: "Removes speed/FOV warping so frames feel steadier." }),
    createOptionOptimization({ id: "darkness-effects-off", title: "Disable darkness effects", category: "Effects", key: "darknessEffectScale", value: "0.0", description: "Removes darkness pulsing and overlay intensity." }),
    createOptionOptimization({ id: "glint-speed-low", title: "Slow enchant glint", category: "Effects", key: "glintSpeed", value: "0.0", description: "Cuts the animation work for enchantment glint." }),
    createOptionOptimization({ id: "glint-strength-low", title: "Lower enchant glint strength", category: "Effects", key: "glintStrength", value: "0.25", description: "Makes enchant overlays lighter and cheaper to notice." }),
    createOptionOptimization({ id: "chunk-updates-prioritized", title: "Prioritize nearby chunk updates", category: "World", key: "prioritizeChunkUpdates", value: "2", risky: true, riskReason: "Far chunks may fill in a little later.", description: "Biases chunk work toward what is closest to you first." }),
    createOptionOptimization({ id: "frame-cap-144", title: "Cap FPS to 144", category: "Launch", key: "maxFps", value: "144", risky: true, riskReason: "Lowers maximum FPS if your machine can run far higher.", description: "Reduces pointless GPU spikes while staying smooth on common high-refresh displays." }),
    createOptionOptimization({ id: "transparency-simple", title: "Simpler transparency", category: "Graphics", key: "improvedTransparency", value: "false", description: "Turns off extra transparency handling work." }),
    createOptionOptimization({ id: "inactive-fps-minimized", title: "Minimize FPS when unfocused", category: "Launch", key: "inactivityFpsLimit", value: "\"minimized\"", description: "Cuts background resource usage when Minecraft is not focused." }),
    createOptionOptimization({ id: "screen-effects-off", title: "Disable screen effects", category: "Effects", key: "screenEffectScale", value: "0.0", description: "Turns off nausea-style screen effect intensity." }),
    createOptionOptimization({ id: "auto-jump-off", title: "Disable auto jump", category: "Movement", key: "autoJump", value: "false", description: "Prevents accidental auto-jump calculations and movement quirks." })
  ];
}

function getOptimizationDefinition(id) {
  return getOptimizationDefinitions().find((item) => item.id === id) || null;
}

function detectOptimizationStatus(definition, minecraftRoot, optimizationState) {
  const filePath = path.join(minecraftRoot, definition.targetFile);
  const { map } = readKeyValueFile(filePath);
  const desiredEntries = Object.entries(definition.desiredValues);
  const active = desiredEntries.every(([key, value]) => map.get(key) === value);
  const record = optimizationState[optimizationRecordKey(definition.id, minecraftRoot)] || null;
  const status = active ? (record ? "applied" : "already-done") : "available";
  return {
    ...definition,
    status,
    active,
    record,
    minecraftRoot
  };
}

function listOptimizationStatuses(payload) {
  const minecraftRoot = resolveOptimizationRoot(payload);
  ensureDir(minecraftRoot);
  const optimizationState = readOptimizationState();
  return getOptimizationDefinitions().map((definition) => detectOptimizationStatus(definition, minecraftRoot, optimizationState));
}

function applyOptimization(definitionId, payload) {
  const definition = getOptimizationDefinition(definitionId);
  if (!definition) throw new Error("Unknown optimization.");

  const minecraftRoot = resolveOptimizationRoot(payload);
  const filePath = path.join(minecraftRoot, definition.targetFile);
  const { map } = readKeyValueFile(filePath);
  const previous = {};
  for (const [key] of Object.entries(definition.desiredValues)) {
    previous[key] = map.has(key) ? map.get(key) : null;
  }
  writePatchedKeyValueFile(filePath, definition.desiredValues);

  const optimizationState = readOptimizationState();
  optimizationState[optimizationRecordKey(definition.id, minecraftRoot)] = {
    id: definition.id,
    title: definition.title,
    minecraftRoot,
    previous,
    desiredValues: definition.desiredValues,
    appliedAt: new Date().toISOString()
  };
  writeOptimizationState(optimizationState);
  appendOptimizationHistory({ action: "apply", id: definition.id, title: definition.title, minecraftRoot });
  return detectOptimizationStatus(definition, minecraftRoot, optimizationState);
}

function undoOptimization(definitionId, payload) {
  const definition = getOptimizationDefinition(definitionId);
  if (!definition) throw new Error("Unknown optimization.");

  const minecraftRoot = resolveOptimizationRoot(payload);
  const optimizationState = readOptimizationState();
  const recordKey = optimizationRecordKey(definition.id, minecraftRoot);
  const record = optimizationState[recordKey];
  if (!record) return detectOptimizationStatus(definition, minecraftRoot, optimizationState);

  const previous = record.previous || {};
  const desired = {};
  const removals = [];
  for (const [key, value] of Object.entries(previous)) {
    if (value === null || typeof value === "undefined") removals.push(key);
    else desired[key] = value;
  }
  writePatchedKeyValueFile(path.join(minecraftRoot, definition.targetFile), desired, removals);

  delete optimizationState[recordKey];
  writeOptimizationState(optimizationState);
  appendOptimizationHistory({ action: "undo", id: definition.id, title: definition.title, minecraftRoot });
  return detectOptimizationStatus(definition, minecraftRoot, optimizationState);
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
      showSnapshots: false,
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
  const normalized = String(message || "");
  const now = Date.now();
  const noisy =
    normalized.startsWith("[download]") ||
    normalized.includes("Found graphics adapter:") ||
    normalized.includes("Searching for graphics cards...");
  if (noisy && normalized === lastLoggedMessage && now - lastLoggedAt < 2500) {
    return;
  }
  lastLoggedMessage = normalized;
  lastLoggedAt = now;
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

function minimizeLauncherWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setSkipTaskbar(false);
    if (!mainWindow.isMinimized()) mainWindow.minimize();
  } catch {
    // ignore
  }
}

function restoreLauncherWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setSkipTaskbar(false);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } catch {
    // ignore
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
    mainWindow.setIcon(icon);
  } catch {
    // ignore
  }

  mainWindow.on("close", (event) => {
    if (process.env.AERO_SMOKE_TEST === "1") return;
    if (currentSession) {
      event.preventDefault();
      minimizeLauncherWindow();
    }
  });

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

  autoUpdaterRef.autoDownload = true;
  autoUpdaterRef.logger = null;

  const shouldSkipUpdatePoll = () =>
    currentUpdateState.stage === "downloading" ||
    currentUpdateState.stage === "installing" ||
    currentUpdateState.stage === "downloaded";

  autoUpdaterRef.on("checking-for-update", () => {
    if (shouldSkipUpdatePoll()) return;
    setUpdateState({
      stage: "checking",
      visible: false,
      action: null,
      message: "",
      progressPercent: null
    });
  });
  autoUpdaterRef.on("update-available", (info) => {
    updateDownloadStarted = true;
    updateLastProgressAt = Date.now();
    setUpdateState({
      stage: "downloading",
      version: info?.version || "",
      visible: true,
      action: null,
      message: `Downloading Zen Client ${info?.version || "update"}...`,
      progressPercent: 0
    });
  });
  autoUpdaterRef.on("update-not-available", () => {
    if (shouldSkipUpdatePoll()) return;
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
    updateLastProgressAt = 0;
    setUpdateState({
      stage: "error",
      visible: true,
      action: null,
      message: `Update problem: ${err?.message || String(err)}`,
      progressPercent: null
    });
  });
  autoUpdaterRef.on("download-progress", (p) => {
    updateDownloadStarted = true;
    updateLastProgressAt = Date.now();
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
    updateDownloadStarted = false;
    updateLastProgressAt = 0;
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
    if (shouldSkipUpdatePoll()) {
      if (
        currentUpdateState.stage === "downloading" &&
        updateLastProgressAt > 0 &&
        Date.now() - updateLastProgressAt > 120000
      ) {
        updateDownloadStarted = false;
        setUpdateState({
          stage: "error",
          visible: true,
          action: null,
          message: "Update download stalled. Please reopen Zen Client and try again.",
          progressPercent: null
        });
      }
      return;
    }
    autoUpdaterRef.checkForUpdates().catch(() => {});
  }, 60_000);
}

function getLoaderLaunchExtras(selectedType, minecraftRoot) {
  const normalized = String(selectedType || "").trim().toLowerCase();
  const libraryRoot = path.join(minecraftRoot, "libraries");

  if (normalized === "forge" || normalized === "neoforge") {
    return {
      customArgs: [`-DlibraryDirectory=${libraryRoot}`],
      overrides: {
        libraryRoot,
        cwd: minecraftRoot
      }
    };
  }

  return {
    customArgs: [],
    overrides: {
      cwd: minecraftRoot
    }
  };
}

function getBundledZenModCandidates(minecraftVersion) {
  const version = String(minecraftVersion || "").trim();
  const versionedName = version ? ZEN_CLIENT_MOD_FILENAME_TEMPLATE.replace("%VERSION%", version) : "";
  return [
    versionedName ? (app.isPackaged ? path.join(process.resourcesPath, "bundled-mods", versionedName) : null) : null,
    versionedName ? path.join(__dirname, "bundled-mods", versionedName) : null,
    app.isPackaged ? path.join(process.resourcesPath, "bundled-mods", ZEN_CLIENT_MOD_FILENAME) : null,
    path.join(__dirname, "bundled-mods", ZEN_CLIENT_MOD_FILENAME)
  ].filter(Boolean);
}

function getBundledZenBundleManifestCandidates() {
  return [
    app.isPackaged ? path.join(process.resourcesPath, "bundled-mods", ZEN_CLIENT_BUNDLE_MANIFEST_FILENAME) : null,
    path.join(__dirname, "bundled-mods", ZEN_CLIENT_BUNDLE_MANIFEST_FILENAME)
  ].filter(Boolean);
}

function readBundledZenBundleManifest() {
  for (const candidate of getBundledZenBundleManifestCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (parsed && Array.isArray(parsed.bundles)) return parsed;
    } catch {
      // Keep looking for another manifest candidate.
    }
  }
  return null;
}

function normalizeZenModLoader(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "fabric") return "fabric";
  if (normalized === "quilt") return "quilt";
  if (normalized === "forge") return "forge";
  if (normalized === "neoforge") return "neoforge";
  return "";
}

function parseMcVersionParts(version) {
  return String(version || "")
    .trim()
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function compareMcVersions(left, right) {
  const a = parseMcVersionParts(left);
  const b = parseMcVersionParts(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function versionMatchesSimpleRange(version, rangeText) {
  const versionValue = String(version || "").trim();
  const range = String(rangeText || "").trim();
  if (!versionValue || !range) return false;

  const parts = range.split(/\s+/).filter(Boolean);
  return parts.every((part) => {
    const match = part.match(/^(>=|<=|>|<|=)?(.+)$/);
    if (!match) return false;
    const operator = match[1] || "=";
    const target = String(match[2] || "").trim();
    const comparison = compareMcVersions(versionValue, target);
    if (operator === ">=") return comparison >= 0;
    if (operator === "<=") return comparison <= 0;
    if (operator === ">") return comparison > 0;
    if (operator === "<") return comparison < 0;
    return comparison === 0;
  });
}

function getBundledZenBundleSpec(launchType, minecraftVersion) {
  const loader = normalizeZenModLoader(launchType);
  const version = String(minecraftVersion || "").trim();
  if (!loader) return null;

  const manifest = readBundledZenBundleManifest();
  if (manifest?.bundles?.length) {
    const exact = manifest.bundles.find((bundle) =>
      String(bundle.loader || "").toLowerCase() === loader &&
      String(bundle.minecraftVersion || "").trim() === version
    );
    if (exact) {
      return {
        ...exact,
        loader,
        minecraftVersion: version
      };
    }

    const loaderOnly = manifest.bundles.find((bundle) =>
      String(bundle.loader || "").toLowerCase() === loader &&
      !String(bundle.minecraftVersion || "").trim()
    );
    if (loaderOnly) {
      return {
        ...loaderOnly,
        loader,
        minecraftVersion: version
      };
    }

    const ranged = manifest.bundles.find((bundle) =>
      String(bundle.loader || "").toLowerCase() === loader &&
      versionMatchesSimpleRange(version, bundle.minecraftVersionRange)
    );
    if (ranged) {
      return {
        ...ranged,
        loader,
        minecraftVersion: version
      };
    }
  }

  if (loader === "fabric") {
    return {
      loader,
      minecraftVersion: version,
      file: version ? ZEN_CLIENT_MOD_FILENAME_TEMPLATE.replace("%VERSION%", version) : ZEN_CLIENT_MOD_FILENAME,
      targetName: ZEN_CLIENT_MOD_FILENAME,
      requiredMods: ["fabric-api"]
    };
  }

  return null;
}

function getBundledZenBundleSourcePath(bundleSpec) {
  if (!bundleSpec?.file) return null;
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, "bundled-mods", bundleSpec.file) : null,
    path.join(__dirname, "bundled-mods", bundleSpec.file)
  ].filter(Boolean);
  return pickNewestFile(candidates);
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
    const details = currentSession.serverLabel
      ? `Playing ${currentSession.serverLabel}`
      : `Zen Client - ${currentSession.launchType || "Vanilla"}`;
    const stateLine = currentSession.serverLabel
      ? `${currentSession.launchType || "Vanilla"} ${currentSession.version || ""}`.trim()
      : `Playing ${currentSession.version || ""}`.trim();
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
      state: selected ? `Ready with ${selected.username}` : "Choosing an account",
      instance: false
    };
  }

  return null;
}

function updateSessionPhaseFromLog(line) {
  if (!currentSession) return;
  const raw = String(line || "").trim();
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

  const serverLabel = parseServerLabelFromLog(raw);
  if (serverLabel && currentSession.serverLabel !== serverLabel) {
    currentSession.serverLabel = serverLabel;
    setDiscordPresence();
  }

  if (next && currentSession.phase !== next) {
    currentSession.phase = next;
    setDiscordPresence();
  }
}

function parseServerLabelFromLog(line) {
  const raw = String(line || "").trim();
  if (!raw) return "";

  const patterns = [
    /connecting to\s+([a-z0-9._:-]+)/i,
    /joined server[:\s]+([a-z0-9._:-]+)/i,
    /joining server[:\s]+([a-z0-9._:-]+)/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;
    return match[1].replace(/^https?:\/\//i, "");
  }

  return "";
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

async function fetchJsonCached(url, cacheKey, maxAgeMs) {
  const cached = readCacheEntry(cacheKey, maxAgeMs);
  if (cached) return cached;
  const fresh = await fetchJson(url);
  writeCacheEntry(cacheKey, fresh);
  return fresh;
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchTextCached(url, cacheKey, maxAgeMs, headers = {}) {
  const cached = readCacheEntry(cacheKey, maxAgeMs);
  if (typeof cached === "string") return cached;
  const fresh = await fetchText(url, headers);
  writeCacheEntry(cacheKey, fresh);
  return fresh;
}

function parseMetadataVersions(xmlText) {
  return Array.from(String(xmlText || "").matchAll(/<version>([^<]+)<\/version>/g), (match) => String(match[1] || "").trim()).filter(Boolean);
}

function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function neoforgeLoaderToMinecraftVersion(loaderVersion) {
  const match = String(loaderVersion || "").match(/^(\d+)\.(\d+)\./);
  if (!match) return "";
  return `1.${match[1]}.${match[2]}`;
}

function isModernMinecraftRelease(version) {
  const value = String(version || "").trim();
  if (!/^1\.\d+(?:\.\d+)?$/.test(value)) return false;
  return compareMcVersions(value, "1.8.9") >= 0;
}

const MIN_SUPPORTED_SNAPSHOT_RELEASE_TIME = Date.parse("2018-10-24T00:00:00Z"); // 18w43a, first 1.14 snapshot.

function isModernSnapshotName(version) {
  const value = String(version || "").trim();
  const lower = value.toLowerCase();
  const weekSnapshot = lower.match(/^(\d{2})w(\d{2})[a-z]$/);
  if (weekSnapshot) {
    const year = Number.parseInt(weekSnapshot[1], 10);
    const week = Number.parseInt(weekSnapshot[2], 10);
    return year > 18 || (year === 18 && week >= 43);
  }

  const prerelease = value.match(/^(1\.\d+(?:\.\d+)?)-(pre|rc)\d+$/i);
  if (prerelease) return compareMcVersions(prerelease[1], "1.14") >= 0;

  return false;
}

function isModernMinecraftGameVersion(version) {
  const value = String(version || "").trim();
  if (!value) return false;
  if (isModernMinecraftRelease(value)) return true;
  return isModernSnapshotName(value);
}

function isModernMinecraftManifestVersion(item) {
  const id = String(item?.id || "").trim();
  if (!id) return false;
  if (isModernMinecraftRelease(id)) return true;
  if (!isModernSnapshotName(id)) return false;

  const releaseTime = Number(new Date(item?.releaseTime || item?.time || 0).getTime());
  if (!Number.isFinite(releaseTime) || releaseTime <= 0) return true;
  return releaseTime >= MIN_SUPPORTED_SNAPSHOT_RELEASE_TIME;
}

function isRecentTimestamp(value, maxAgeMs) {
  const ts = Number(new Date(value || 0).getTime());
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return Date.now() - ts <= maxAgeMs;
}

async function fetchVersions() {
  const [manifest, fabricGames, quiltGames, forgeMetadata, neoforgeMetadata] = await Promise.all([
    fetchJsonCached("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json", "versions-mojang", 30 * 60 * 1000),
    fetchJsonCached("https://meta.fabricmc.net/v2/versions/game", "versions-fabric-games", 30 * 60 * 1000),
    fetchJsonCached("https://meta.quiltmc.org/v3/versions/game", "versions-quilt-games", 30 * 60 * 1000),
    fetchTextCached("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml", "versions-forge-metadata", 12 * 60 * 60 * 1000),
    fetchTextCached("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml", "versions-neoforge-metadata", 12 * 60 * 60 * 1000)
  ]);

  const forgeVersions = uniqueList(
    parseMetadataVersions(forgeMetadata)
      .map((item) => item.match(/^(1\.\d+(?:\.\d+)?)-/)?.[1] || "")
      .filter((item) => item.startsWith("1."))
  ).reverse();
  const neoforgeVersions = uniqueList(
    parseMetadataVersions(neoforgeMetadata).map((item) => neoforgeLoaderToMinecraftVersion(item)).filter((item) => item.startsWith("1."))
  ).reverse();

  const vanillaVersions = manifest.versions
    .filter((item) => item && item.id && item.type !== "old_alpha" && item.type !== "old_beta")
    .filter(isModernMinecraftManifestVersion)
    .map((item) => String(item.id || "").trim());

  const fabricVersions = uniqueList(
    fabricGames
      .map((item) => String(item?.version || "").trim())
      .filter(isModernMinecraftGameVersion)
  );

  const quiltVersions = uniqueList(
    quiltGames
      .map((item) => String(item?.version || "").trim())
      .filter(isModernMinecraftGameVersion)
  );

  return {
    vanilla: vanillaVersions,
    fabric: fabricVersions,
    quilt: quiltVersions,
    forge: forgeVersions.slice(0, 80),
    neoforge: neoforgeVersions.slice(0, 80)
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

function normalizeLaunchAuthorization(token) {
  return {
    ...token,
    user_properties:
      typeof token?.user_properties === "string"
        ? token.user_properties
        : JSON.stringify(token?.user_properties || {}),
    meta: {
      type: "msa",
      ...(token?.meta || {})
    }
  };
}

async function verifyMinecraftProfile(accessToken) {
  const response = await fetch("https://api.minecraftservices.com/minecraft/profile", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  return response.ok;
}

async function interactiveMicrosoftSignIn(existingAccountId = null) {
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
    id: existingAccountId || crypto.randomUUID(),
    type: "microsoft",
    username: mclcToken.name,
    uuid: mclcToken.uuid,
    mclcToken
  };
  upsertAccount(account);
  appendLog(`[microsoft] Signed in as ${account.username}`);
  return account;
}

async function microsoftSignIn() {
  const account = await interactiveMicrosoftSignIn();
  return sanitizeAccount(account);
}

async function resolveAuth(account) {
  if (account.type === "microsoft") {
    if (
      account.cachedLaunchAuth &&
      account.cachedLaunchAuth.access_token &&
      isRecentTimestamp(account.cachedLaunchAuthValidatedAt, AUTH_CACHE_MAX_AGE_MS)
    ) {
      appendLog(`[microsoft] Using recent saved session for ${account.username}`);
      return normalizeLaunchAuthorization(account.cachedLaunchAuth);
    }

    const auth = new Auth("select_account");
    const minecraft = await tokenUtils.fromMclcToken(auth, account.mclcToken, true);
    const refreshedToken = minecraft.mclc(true);
    const launchAuth = normalizeLaunchAuthorization(refreshedToken);
    let profileOk = false;
    try {
      profileOk = await verifyMinecraftProfile(launchAuth.access_token);
    } catch {
      profileOk = false;
    }
    if (!profileOk) {
      appendLog("[microsoft] Session looked stale. Requesting a fresh Microsoft sign-in...");
      const refreshedAccount = await interactiveMicrosoftSignIn(account.id);
      return normalizeLaunchAuthorization(refreshedAccount.mclcToken);
    }
    updateState((draft) => {
      const target = draft.accounts.find((item) => item.id === account.id);
      if (target) {
        target.username = refreshedToken.name;
        target.uuid = refreshedToken.uuid;
        target.mclcToken = refreshedToken;
        target.cachedLaunchAuth = launchAuth;
        target.cachedLaunchAuthValidatedAt = new Date().toISOString();
      }
    });
    sendEvent("state-updated", getClientState());
    appendLog(`[microsoft] Refreshed sign-in for ${refreshedToken.name}`);
    return launchAuth;
  }

  return Authenticator.getAuth(account.username);
}

async function resolveMinecraftServicesAccessToken(account) {
  const auth = await resolveAuth(account);
  return auth.access_token;
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

  const rootKey = sanitizePathSegment(minecraftRoot || DEFAULT_ROOT, "default-root");
  const cachedJava = readCacheEntry(`java-path-${rootKey}`, 30 * 24 * 60 * 60 * 1000);
  if (typeof cachedJava === "string" && cachedJava && fs.existsSync(cachedJava)) {
    return cachedJava;
  }

  const runtimePath = path.join(minecraftRoot, "runtime");
  const runtimeJava = findJavaInDirectory(runtimePath);
  if (runtimeJava) {
    writeCacheEntry(`java-path-${rootKey}`, runtimeJava);
    return runtimeJava;
  }

  if (process.env.JAVA_HOME) {
    const javaHomePath = path.join(process.env.JAVA_HOME, "bin", "java.exe");
    if (fs.existsSync(javaHomePath)) {
      writeCacheEntry(`java-path-${rootKey}`, javaHomePath);
      return javaHomePath;
    }
  }

  const programFiles = [
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Java"),
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Eclipse Adoptium"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Java")
  ];

  for (const directory of programFiles) {
    const found = findJavaInDirectory(directory);
    if (found) {
      writeCacheEntry(`java-path-${rootKey}`, found);
      return found;
    }
  }

  const whereJava = spawnSync("where", ["java"], { encoding: "utf8" });
  if (whereJava.status === 0) {
    const first = whereJava.stdout.split(/\r?\n/).find(Boolean);
    if (first) {
      const resolved = first.trim();
      writeCacheEntry(`java-path-${rootKey}`, resolved);
      return resolved;
    }
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

function ensureLauncherProfilesFile(minecraftRoot) {
  const target = path.join(minecraftRoot, "launcher_profiles.json");
  if (fs.existsSync(target)) return target;

  const source = path.join(DEFAULT_ROOT, "launcher_profiles.json");
  ensureDir(minecraftRoot);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
    return target;
  }

  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        profiles: {},
        settings: {},
        version: 3
      },
      null,
      2
    ),
    "utf8"
  );
  return target;
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
  const loaders = await fetchJsonCached(
    `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`,
    `fabric-loader-${mcVersion}`,
    12 * 60 * 60 * 1000
  );
  return loaders[0]?.loader?.version;
}

async function getLatestQuiltLoader(mcVersion) {
  const loaders = await fetchJsonCached(
    `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`,
    `quilt-loader-${mcVersion}`,
    12 * 60 * 60 * 1000
  );
  if (Array.isArray(loaders)) {
    return loaders[0]?.loader?.version;
  }
  return loaders?.loader?.version;
}

async function getLatestForgeLoader(mcVersion) {
  const metadata = await fetchTextCached(
    "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml",
    "forge-metadata",
    12 * 60 * 60 * 1000
  );
  const matches = parseMetadataVersions(metadata).filter((item) => item.startsWith(`${mcVersion}-`));
  return matches[matches.length - 1] || "";
}

async function getLatestNeoForgeLoader(mcVersion) {
  const metadata = await fetchTextCached(
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml",
    "neoforge-metadata",
    12 * 60 * 60 * 1000
  );
  const matches = parseMetadataVersions(metadata).filter((item) => neoforgeLoaderToMinecraftVersion(item) === mcVersion);
  return matches[matches.length - 1] || "";
}

function findInstalledVersionCandidate(minecraftRoot, prefix, matcher) {
  const versionsDir = path.join(minecraftRoot, "versions");
  if (!fs.existsSync(versionsDir)) return "";
  const candidates = fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && matcher(entry.name) && getVersionInstallInfo(minecraftRoot, entry.name).isValid)
    .map((entry) => {
      const full = path.join(versionsDir, entry.name);
      return {
        name: entry.name,
        mtime: fs.statSync(full).mtimeMs
      };
    });

  if (!candidates.length) return "";
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].name;
}

async function ensureFabricInstall(minecraftRoot, javaPath, minecraftVersion) {
  const existingCandidate = findInstalledVersionCandidate(
    minecraftRoot,
    "fabric-loader-",
    (name) => name.endsWith(`-${minecraftVersion}`)
  );
  if (existingCandidate) return existingCandidate;

  const loaderVersion = await getLatestFabricLoader(minecraftVersion);
  if (!loaderVersion) throw new Error("Could not find a Fabric loader for that version.");
  const versionId = `fabric-loader-${loaderVersion}-${minecraftVersion}`;
  const installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (installInfo.isValid) return versionId;
  if (repairInheritedVersionJar(minecraftRoot, versionId)) return versionId;
  if (installInfo.jsonExists || installInfo.jarExists) {
    removeBrokenVersionInstall(minecraftRoot, versionId, "fabric");
  }

  const installers = await fetchJsonCached(
    "https://meta.fabricmc.net/v2/versions/installer",
    "fabric-installers",
    24 * 60 * 60 * 1000
  );
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
  const existingCandidate = findInstalledVersionCandidate(
    minecraftRoot,
    "quilt-loader-",
    (name) => name.endsWith(`-${minecraftVersion}`)
  );
  if (existingCandidate) return existingCandidate;

  const loaderVersion = await getLatestQuiltLoader(minecraftVersion);
  if (!loaderVersion) throw new Error("Could not find a Quilt loader for that version.");
  const versionId = `quilt-loader-${loaderVersion}-${minecraftVersion}`;
  let installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (installInfo.isValid) return versionId;
  if (repairInheritedVersionJar(minecraftRoot, versionId)) return versionId;
  if (installInfo.jsonExists || installInfo.jarExists) {
    removeBrokenVersionInstall(minecraftRoot, versionId, "quilt");
  }

  const installers = await fetchJsonCached(
    "https://meta.quiltmc.org/v3/versions/installer",
    "quilt-installers",
    24 * 60 * 60 * 1000
  );
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

async function ensureForgeInstall(minecraftRoot, javaPath, minecraftVersion) {
  const existingCandidate = findInstalledVersionCandidate(
    minecraftRoot,
    "forge-",
    (name) => name.includes(minecraftVersion)
  );
  if (existingCandidate) return existingCandidate;

  const loaderVersion = await getLatestForgeLoader(minecraftVersion);
  if (!loaderVersion) throw new Error("Could not find a Forge loader for that version.");
  const versionId = `forge-${loaderVersion}`;
  let installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (installInfo.isValid) return versionId;
  if (repairInheritedVersionJar(minecraftRoot, versionId)) return versionId;
  if (installInfo.jsonExists || installInfo.jarExists) {
    removeBrokenVersionInstall(minecraftRoot, versionId, "forge");
  }

  ensureLauncherProfilesFile(minecraftRoot);
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${loaderVersion}/forge-${loaderVersion}-installer.jar`;
  const installerPath = path.join(INSTALLER_DIR, `forge-installer-${loaderVersion}.jar`);
  await ensureFile(installerUrl, installerPath);
  await spawnLogged(javaPath, ["-jar", installerPath, "--installClient", minecraftRoot], "forge");

  installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (repairInheritedVersionJar(minecraftRoot, versionId)) {
    installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  }
  if (installInfo.isValid) return versionId;

  const fallback = findInstalledVersionCandidate(
    minecraftRoot,
    "forge-",
    (name) => name.includes(minecraftVersion) || name.endsWith(loaderVersion)
  );
  if (fallback) {
    appendLog(`[forge] Using installed version ${fallback} (expected ${versionId})`);
    return fallback;
  }

  throw new Error("Forge installed, but the launcher could not find the Forge version JSON. Check the log above for installer output.");
}

async function ensureNeoForgeInstall(minecraftRoot, javaPath, minecraftVersion) {
  const existingCandidate = findInstalledVersionCandidate(
    minecraftRoot,
    "neoforge-",
    (name) => neoforgeLoaderToMinecraftVersion(name.replace(/^neoforge-/, "")) === minecraftVersion
  );
  if (existingCandidate) return existingCandidate;

  const loaderVersion = await getLatestNeoForgeLoader(minecraftVersion);
  if (!loaderVersion) throw new Error("Could not find a NeoForge loader for that version.");
  const versionId = `neoforge-${loaderVersion}`;
  let installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (installInfo.isValid) return versionId;
  if (repairInheritedVersionJar(minecraftRoot, versionId)) return versionId;
  if (installInfo.jsonExists || installInfo.jarExists) {
    removeBrokenVersionInstall(minecraftRoot, versionId, "neoforge");
  }

  ensureLauncherProfilesFile(minecraftRoot);
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
  const installerPath = path.join(INSTALLER_DIR, `neoforge-installer-${loaderVersion}.jar`);
  await ensureFile(installerUrl, installerPath);
  await spawnLogged(javaPath, ["-jar", installerPath, "--installClient", minecraftRoot], "neoforge");

  installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  if (repairInheritedVersionJar(minecraftRoot, versionId)) {
    installInfo = getVersionInstallInfo(minecraftRoot, versionId);
  }
  if (installInfo.isValid) return versionId;

  const fallback = findInstalledVersionCandidate(
    minecraftRoot,
    "neoforge-",
    (name) => name === versionId || name.includes(loaderVersion)
  );
  if (fallback) {
    appendLog(`[neoforge] Using installed version ${fallback} (expected ${versionId})`);
    return fallback;
  }

  throw new Error("NeoForge installed, but the launcher could not find the NeoForge version JSON. Check the log above for installer output.");
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
      recordInstalledModrinthFile(minecraftRoot, path.basename(target), {
        projectType: "mod",
        loader: selected,
        minecraftVersion,
        slug
      });
      appendLog(`[mods] Installed ${label} -> ${path.basename(target)}`);
    } catch (error) {
      appendLog(`[mods] Failed to install ${label}: ${error?.message || String(error)}`);
    }
  }
}

async function ensureZenClientDependencies(minecraftRoot, minecraftVersion, launchType) {
  const selected = normalizeZenModLoader(launchType);
  const bundleSpec = getBundledZenBundleSpec(selected, minecraftVersion);
  if (!bundleSpec) return;

  const modsDir = path.join(minecraftRoot, "mods");
  ensureDir(modsDir);

  for (const slug of bundleSpec.requiredMods || []) {
    const label = ZEN_CLIENT_REQUIRED_MOD_LABELS[slug] || slug;
    const target = path.join(modsDir, `${slug}.jar`);
    if (fs.existsSync(target)) continue;

    try {
      appendLog(`[zen-mod] Resolving dependency ${label}...`);
      const download = await modrinthPickDownload(slug, minecraftVersion, launchType);
      if (!download) {
        appendLog(`[zen-mod] No compatible ${label} build was found for ${selected} ${minecraftVersion}.`);
        continue;
      }
      await ensureFile(download.url, target);
      recordInstalledModrinthFile(minecraftRoot, path.basename(target), {
        projectType: "mod",
        loader: selected,
        minecraftVersion,
        slug
      });
      appendLog(`[zen-mod] Installed dependency ${label} -> ${path.basename(target)}`);
    } catch (error) {
      appendLog(`[zen-mod] Failed to install dependency ${label}: ${error?.message || String(error)}`);
    }
  }
}

function resolveBundledZenClientModPath(bundleSpec, minecraftVersion) {
  const manifestPath = getBundledZenBundleSourcePath(bundleSpec);
  if (manifestPath) return manifestPath;

  const directCandidates = getBundledZenModCandidates(minecraftVersion);

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

async function ensureZenClientMod(minecraftRoot, launchType, minecraftVersion) {
  const selected = normalizeZenModLoader(launchType);
  if (!selected || selected === "vanilla") return;

  const bundleSpec = getBundledZenBundleSpec(selected, minecraftVersion);
  if (!bundleSpec) {
    appendLog(`[zen-mod] No Zen Client in-game bundle is available for ${selected} ${minecraftVersion}. Skipping in-game Zen features for this combination.`);
    return;
  }

  const source = resolveBundledZenClientModPath(bundleSpec, minecraftVersion);
  if (!source) {
    appendLog(`[zen-mod] Expected a bundled Zen Client mod for ${selected} ${minecraftVersion}, but no bundle file was found.`);
    return;
  }

  const modsDir = path.join(minecraftRoot, "mods");
  ensureDir(modsDir);
  const targetName = String(bundleSpec.targetName || `zen-client-${selected}.jar`).trim() || `zen-client-${selected}.jar`;
  const target = path.join(modsDir, targetName);

  for (const staleName of ["zen-client-fabric.jar", "zen-client-quilt.jar", "zen-client-forge.jar", "zen-client-neoforge.jar"]) {
    if (staleName === targetName) continue;
    const stalePath = path.join(modsDir, staleName);
    if (fs.existsSync(stalePath)) {
      try {
        fs.unlinkSync(stalePath);
      } catch {
        // ignore cleanup failures
      }
    }
  }

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
  recordInstalledModrinthFile(minecraftRoot, path.basename(target), {
    projectType: "mod",
    loader: selected,
    minecraftVersion,
    slug: `zen-client-${selected}`
  });
  appendLog(`[zen-mod] Installed bundled Zen Client mod for ${selected} -> ${path.basename(target)}`);
}

async function launchGame(settings) {
  const state = loadState();
  const account = state.accounts.find((item) => item.id === state.selectedAccountId);
  if (!account) throw new Error("Choose an account first.");

  const baseMinecraftRoot = settings.minecraftDirectory || DEFAULT_ROOT;
  const minecraftRoot = resolveInstanceRoot(baseMinecraftRoot, settings.launchType, settings.minecraftVersion);
  ensureDir(minecraftRoot);

  const authorization = await resolveAuth(account);
  const javaPath = findJavaExecutable(settings.javaPath, baseMinecraftRoot);
  appendLog(`[launch] Using Java at ${javaPath}`);
  if (minecraftRoot !== baseMinecraftRoot) {
    appendLog(`[launch] Using isolated instance folder ${minecraftRoot}`);
  }

  let customVersion = null;
  const selectedType = settings.launchType || "Vanilla";
  const selectedVersion = settings.minecraftVersion;
  if (!selectedVersion) throw new Error("Pick a Minecraft version first.");

  if (selectedType === "Fabric") {
    customVersion = await ensureFabricInstall(minecraftRoot, javaPath, selectedVersion);
  } else if (selectedType === "Quilt") {
    customVersion = await ensureQuiltInstall(minecraftRoot, javaPath, selectedVersion);
  } else if (selectedType === "Forge") {
    customVersion = await ensureForgeInstall(minecraftRoot, javaPath, selectedVersion);
  } else if (selectedType === "NeoForge") {
    customVersion = await ensureNeoForgeInstall(minecraftRoot, javaPath, selectedVersion);
  }

  const loaderLaunchExtras = getLoaderLaunchExtras(selectedType, minecraftRoot);

  if (ensureSafeVideoMode(minecraftRoot)) {
    appendLog("[launch] Applied safe video mode (windowed 1280x720) before startup.");
  }

  const quarantinedMods = auditInstanceMods(minecraftRoot, selectedVersion, selectedType);
  for (const item of quarantinedMods) {
    appendLog(`[mods] Disabled ${item.name} (${item.reason}) -> mods-disabled`);
  }

  await ensureZenClientDependencies(minecraftRoot, selectedVersion, selectedType);
  await ensureZenClientMod(minecraftRoot, selectedType, selectedVersion);
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
    const recovered = recoverFromLaunchCrash(currentLaunchContext?.minecraftRoot, code);
    for (const item of recovered) {
      appendLog(`[mods] Removed ${item.name} due to a launch issue (${item.reason}). Please relaunch.`);
    }
    sendEvent("launcher-closed", { code });
    currentLaunchContext = null;
    currentSession = null;
    setDiscordPresence();
    restoreLauncherWindow();
  });

  const launchOptions = {
    authorization,
    root: minecraftRoot,
    version: {
      number: selectedVersion,
      type: "release",
      ...(customVersion ? { custom: customVersion } : {})
    },
    window: {
      width: 1280,
      height: 720,
      fullscreen: false
    },
    memory: {
      max: `${settings.memoryMb || 4096}M`,
      min: "1024M"
    },
    javaPath,
    customArgs: loaderLaunchExtras.customArgs,
    overrides: {
      detached: false,
      ...loaderLaunchExtras.overrides
    }
  };

  appendLog(`[launch] Starting ${selectedType} ${selectedVersion}${customVersion ? ` as ${customVersion}` : ""}`);
  currentLaunchContext = {
    minecraftRoot,
    selectedVersion,
    selectedType
  };
  currentSession = {
    launchType: selectedType,
    version: selectedVersion,
    username: account.username,
    phase: null,
    serverLabel: ""
  };
  setDiscordPresence();

  // Keep the launcher minimized while Minecraft is running so it does not interfere with fullscreen input/cursor behavior.
  minimizeLauncherWindow();

  const proc = await launchClient.launch(launchOptions);
  if (!proc) {
    currentLaunchContext = null;
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
  const root = resolveInstanceRoot(
    payload?.minecraftDirectory || DEFAULT_ROOT,
    payload?.launchType,
    payload?.minecraftVersion
  );
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
  const root = resolveInstanceRoot(
    payload?.minecraftDirectory || DEFAULT_ROOT,
    payload?.launchType,
    payload?.minecraftVersion
  );
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


ipcMain.handle("optimizations:list", async (_event, payload) => {
  return listOptimizationStatuses(payload);
});

ipcMain.handle("optimizations:apply", async (_event, payload) => {
  const result = applyOptimization(String(payload?.id || ""), payload);
  appendLog(`[optimize] Applied ${result.title}.`);
  return result;
});

ipcMain.handle("optimizations:undo", async (_event, payload) => {
  const result = undoOptimization(String(payload?.id || ""), payload);
  appendLog(`[optimize] Reverted ${result.title}.`);
  return result;
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
  if (normalized === "forge") return "forge";
  if (normalized === "neoforge") return "neoforge";
  return "";
}

ipcMain.handle("modrinth:install", async (_event, payload) => {
  const projectId = String(payload?.projectId || "").trim();
  const projectType = String(payload?.projectType || "").trim();
  const minecraftRoot = resolveInstanceRoot(
    payload?.minecraftDirectory || DEFAULT_ROOT,
    payload?.launchType,
    payload?.minecraftVersion
  );
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

  const versions = await modrinthFetchJson(versionsUrl.toString());

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
  if (projectType === "mod") {
    recordInstalledModrinthFile(minecraftRoot, fileName, {
      projectType,
      loader,
      minecraftVersion,
      projectId
    });
  }
  appendLog(`[modrinth] Installed ${fileName}`);
  return { path: outPath, fileName };
});

ipcMain.handle("update:startDownload", async () => {
  if (!autoUpdaterRef) throw new Error("Auto-update is only available in the installed build.");
  if (currentUpdateState.stage === "downloading") return true;
  setUpdateState({
    stage: "downloading",
    visible: true,
    action: null,
    message: "Downloading update...",
    progressPercent: 0
  });
  updateDownloadStarted = true;
  updateLastProgressAt = Date.now();
  await autoUpdaterRef.downloadUpdate();
  return true;
});

ipcMain.handle("update:installNow", async () => {
  if (!autoUpdaterRef) throw new Error("Auto-update is only available in the installed build.");
  setUpdateState({
    stage: "installing",
    visible: true,
    action: null,
    message: "Updating Zen Client...",
    progressPercent: 100
  });
  autoUpdaterRef.quitAndInstall(true, true);
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
  ensureDir(CACHE_DIR);
  ensureDir(INSTALLER_DIR);
  ensureDir(OPTIMIZATION_DIR);
  createWindow();
  initAutoUpdater();
  setDiscordPresence();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else restoreLauncherWindow();
  });
});

app.on("window-all-closed", () => {
  if (currentSession) return;
  if (process.platform !== "darwin") app.quit();
});
