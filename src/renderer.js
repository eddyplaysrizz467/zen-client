const accountsList = document.getElementById("accountsList");
const heroHelp = document.getElementById("heroHelp");
const statusText = document.getElementById("statusText");
const progressText = document.getElementById("progressText");
const logBox = document.getElementById("logBox");

const tabLauncher = document.getElementById("tabLauncher");
const tabSettings = document.getElementById("tabSettings");
const tabLibrary = document.getElementById("tabLibrary");
const tabSkins = document.getElementById("tabSkins");
const panelLauncher = document.getElementById("panelLauncher");
const panelSettings = document.getElementById("panelSettings");
const panelLibrary = document.getElementById("panelLibrary");
const panelSkins = document.getElementById("panelSkins");

const launchType = document.getElementById("launchType");
const minecraftVersion = document.getElementById("minecraftVersion");
const memoryMb = document.getElementById("memoryMb");
const minecraftDirectory = document.getElementById("minecraftDirectory");
const javaPath = document.getElementById("javaPath");

const backgroundPreset = document.getElementById("backgroundPreset");
const discordEnabled = document.getElementById("discordEnabled");
const discordAppId = document.getElementById("discordAppId");
const discordShowLauncher = document.getElementById("discordShowLauncher");
const discordShowPlaying = document.getElementById("discordShowPlaying");
const installMenuPackButton = document.getElementById("installMenuPackButton");

const skinPreviewBox = document.getElementById("skinPreviewBox");
const refreshSkinButton = document.getElementById("refreshSkinButton");

const refreshModsButton = document.getElementById("refreshModsButton");
const refreshPacksButton = document.getElementById("refreshPacksButton");
const modsSearch = document.getElementById("modsSearch");
const packsSearch = document.getElementById("packsSearch");
const modsList = document.getElementById("modsList");
const packsList = document.getElementById("packsList");

const microsoftButton = document.getElementById("microsoftButton");
const removeAccountButton = document.getElementById("removeAccountButton");
const offlineButton = document.getElementById("offlineButton");
const refreshVersionsButton = document.getElementById("refreshVersionsButton");
const launchButton = document.getElementById("launchButton");

const offlineUsername = document.getElementById("offlineUsername");
const offlineUuid = document.getElementById("offlineUuid");

let state = null;
let versions = { vanilla: [], fabric: [], quilt: [] };
let busy = false;
// Panda + bubble visuals were removed per request.
let libraryBusy = false;
let modrinthMods = [];
let modrinthPacks = [];

function setBusy(nextBusy) {
  busy = nextBusy;
  [
    microsoftButton,
    removeAccountButton,
    offlineButton,
    refreshVersionsButton,
    launchButton,
    installMenuPackButton,
    refreshSkinButton
  ].forEach((button) => {
    button.disabled = nextBusy;
  });
}

function loaderKey(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "fabric") return "fabric";
  if (normalized === "quilt") return "quilt";
  return "vanilla";
}

function getSelectedAccount() {
  return state?.accounts.find((account) => account.id === state.selectedAccountId) || null;
}

function isMicrosoftSelected() {
  const selected = getSelectedAccount();
  return Boolean(selected && selected.type === "microsoft");
}

function renderAccounts() {
  accountsList.innerHTML = "";
  if (!state.accounts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No saved accounts yet. Sign in with Microsoft or add an offline profile.";
    accountsList.appendChild(empty);
    removeAccountButton.disabled = true;
    return;
  }

  removeAccountButton.disabled = busy || !getSelectedAccount();

  state.accounts.forEach((account) => {
    const button = document.createElement("button");
    button.className = `account-item${account.id === state.selectedAccountId ? " selected" : ""}`;
    button.innerHTML = `<span class="account-name">${account.username}</span><span class="account-type">${account.type === "microsoft" ? "Microsoft account" : "Offline profile"}</span>`;
    button.addEventListener("click", async () => {
      await window.aeroApi.selectAccount(account.id);
    });
    accountsList.appendChild(button);
  });
}

function renderSettings() {
  if (!state) return;
  launchType.value = state.settings.launchType || "Vanilla";
  memoryMb.value = state.settings.memoryMb || 4096;
  minecraftDirectory.value = state.settings.minecraftDirectory || "";
  javaPath.value = state.settings.javaPath || "";
  backgroundPreset.value = normalizeBackgroundPreset(state.settings.backgroundPreset);
  discordEnabled.value = state.settings.discordPresenceEnabled ? "on" : "off";
  discordAppId.value = state.settings.discordAppId || "";
  discordShowLauncher.value = state.settings.discordShowLauncher ? "on" : "off";
  discordShowPlaying.value = state.settings.discordShowPlaying ? "on" : "off";
  renderVersions();
}

function renderVersions() {
  const key = loaderKey(launchType.value);
  const items = versions[key] || [];
  const current = state?.settings?.minecraftVersion || "";
  minecraftVersion.innerHTML = "";
  items.forEach((version) => {
    const option = document.createElement("option");
    option.value = version;
    option.textContent = version;
    minecraftVersion.appendChild(option);
  });
  if (items.includes(current)) {
    minecraftVersion.value = current;
  } else if (items.length) {
    minecraftVersion.value = items[0];
  }
}

function renderHero() {
  const selected = getSelectedAccount();
  if (!selected) {
    heroHelp.textContent = "Step 1: choose an account. Step 2: choose a version. Step 3: launch.";
    return;
  }
  if (selected.type === "microsoft") {
    heroHelp.textContent = `Signed in as ${selected.username}. Pick a loader and launch Minecraft.`;
  } else {
    heroHelp.textContent = `Offline profile ${selected.username} selected. Use Microsoft sign-in if you want real online account auth.`;
  }
}

function skinHeadUrl(account) {
  const username = String(account?.username || "").trim();
  const rawUuid = String(account?.uuid || "").trim();
  const cleanUuid = rawUuid.replace(/-/g, "");

  if (cleanUuid) {
    return `https://crafatar.com/avatars/${encodeURIComponent(cleanUuid)}?size=128&overlay`;
  }

  if (username) {
    return `https://minotar.net/helm/${encodeURIComponent(username)}/128.png`;
  }

  return "";
}

function renderSkinHead() {
  const selected = getSelectedAccount();
  if (!selected) {
    skinPreviewBox.innerHTML = `<div class="empty-state">Select an account to load skin info.</div>`;
    return;
  }

  const url = skinHeadUrl(selected);
  if (!url) {
    skinPreviewBox.innerHTML = `<div class="empty-state">No skin info available for this account.</div>`;
    return;
  }

  skinPreviewBox.innerHTML = `<img alt="Minecraft skin head preview" referrerpolicy="no-referrer" src="${url}" />`;
}

function normalizeBackgroundPreset(presetValue) {
  const normalized = String(presetValue || "").toLowerCase();
  if (normalized === "ink") return "ink";
  if (normalized === "stone") return "stone";
  if (normalized === "bamboo") return "bamboo";
  return "ink";
}

function applyBackgroundPreset(presetValue) {
  const preset = normalizeBackgroundPreset(presetValue);
  document.documentElement.dataset.preset = preset;
}

function appendLog(message) {
  logBox.textContent = `${logBox.textContent}${message}\n`;
  logBox.scrollTop = logBox.scrollHeight;

  const line = String(message || "").toLowerCase();
  if (line.includes("joining server") || line.includes("connecting to")) {
    statusText.textContent = "Loading peace...";
  } else if (line.includes("loading terrain")) {
    statusText.textContent = "Have fun!";
  }
}

// (Bubble popping removed.)

function syncFromState(nextState) {
  state = nextState;
  applyBackgroundPreset(state?.settings?.backgroundPreset);
  logBox.textContent = "";
  (state.log || []).forEach((line) => appendLog(line));
  renderAccounts();
  renderSettings();
  renderHero();
}

function collectSettings() {
  return {
    launchType: launchType.value,
    minecraftVersion: minecraftVersion.value,
    minecraftDirectory: minecraftDirectory.value.trim(),
    javaPath: javaPath.value.trim(),
    memoryMb: Number(memoryMb.value || 4096),
    backgroundPreset: backgroundPreset.value,
    discordPresenceEnabled: discordEnabled.value === "on",
    discordAppId: discordAppId.value.trim(),
    discordShowLauncher: discordShowLauncher.value === "on",
    discordShowPlaying: discordShowPlaying.value === "on"
  };
}

async function saveSettings() {
  state = await window.aeroApi.saveSettings(collectSettings());
  renderHero();
}

async function refreshVersions() {
  setBusy(true);
  statusText.textContent = "Loading versions...";
  try {
    versions = await window.aeroApi.getVersions();
    renderVersions();
    statusText.textContent = "Versions loaded.";
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

function setActiveTab(tabName) {
  const tabs = [
    { name: "launcher", button: tabLauncher, panel: panelLauncher },
    { name: "settings", button: tabSettings, panel: panelSettings },
    { name: "library", button: tabLibrary, panel: panelLibrary },
    { name: "skins", button: tabSkins, panel: panelSkins }
  ];
  tabs.forEach(({ name, button, panel }) => {
    const active = name === tabName;
    button.classList.toggle("active", active);
    panel.classList.toggle("active", active);
  });
  localStorage.setItem("aeroTab", tabName);
  if (tabName === "skins") renderSkinHead();
  if (tabName === "library") ensureLibraryLoaded().catch(() => {});
}

tabLauncher.addEventListener("click", () => setActiveTab("launcher"));
tabSettings.addEventListener("click", () => setActiveTab("settings"));
tabLibrary.addEventListener("click", () => setActiveTab("library"));
tabSkins.addEventListener("click", () => setActiveTab("skins"));

launchType.addEventListener("change", async () => {
  renderVersions();
  await saveSettings();
});

[memoryMb, minecraftDirectory, javaPath, backgroundPreset, discordEnabled, discordAppId, discordShowLauncher, discordShowPlaying].forEach((element) => {
  element.addEventListener("change", saveSettings);
});

minecraftVersion.addEventListener("change", saveSettings);

microsoftButton.addEventListener("click", async () => {
  setBusy(true);
  statusText.textContent = "Opening Microsoft sign-in...";
  try {
    const result = await window.aeroApi.microsoftLogin();
    syncFromState(result.state);
    statusText.textContent = `Microsoft account saved: ${result.account.username}`;
    if (localStorage.getItem("aeroTab") === "skins") renderSkinHead();
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

offlineButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await window.aeroApi.addOfflineAccount({
      username: offlineUsername.value,
      uuid: offlineUuid.value
    });
    offlineUsername.value = "";
    offlineUuid.value = "";
    statusText.textContent = "Offline account saved.";
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

removeAccountButton.addEventListener("click", async () => {
  const selected = getSelectedAccount();
  if (!selected) return;
  setBusy(true);
  try {
    await window.aeroApi.removeAccount(selected.id);
    statusText.textContent = "Selected account removed.";
  } finally {
    setBusy(false);
  }
});

refreshVersionsButton.addEventListener("click", refreshVersions);

installMenuPackButton.addEventListener("click", async () => {
  setBusy(true);
  statusText.textContent = "Installing Zen menu pack...";
  try {
    await saveSettings();
    const settings = collectSettings();
    await window.aeroApi.installAeroMenuPack({
      minecraftDirectory: settings.minecraftDirectory,
      preset: settings.backgroundPreset
    });
    statusText.textContent = "Zen menu pack installed. Enable it in Minecraft Resource Packs.";
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

refreshSkinButton.addEventListener("click", () => renderSkinHead());

function formatDownloads(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}b`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}m`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function libraryItemCard(item, projectType) {
  const row = document.createElement("div");
  row.className = "library-item";

  const title = document.createElement("div");
  title.className = "library-item-title";
  title.textContent = item.title || item.slug || "Unknown";

  const meta = document.createElement("div");
  meta.className = "library-item-meta";
  const downloads = formatDownloads(item.downloads);
  meta.textContent = downloads ? `${downloads} downloads` : "";

  const desc = document.createElement("div");
  desc.className = "library-item-desc";
  desc.textContent = item.description || "";

  const actions = document.createElement("div");
  actions.className = "library-item-actions";

  const openBtn = document.createElement("button");
  openBtn.className = "ghost";
  openBtn.type = "button";
  openBtn.textContent = "Open";
  openBtn.addEventListener("click", () => {
    const url = `https://modrinth.com/${projectType}/${item.slug}`;
    window.aeroApi.openExternal(url).catch(() => {});
  });

  const installBtn = document.createElement("button");
  installBtn.className = "primary";
  installBtn.type = "button";
  installBtn.textContent = "Install";
  installBtn.addEventListener("click", async () => {
    const settings = collectSettings();
    setBusy(true);
    statusText.textContent = `Installing ${item.title || item.slug}...`;
    try {
      await window.aeroApi.installModrinth({
        projectId: item.project_id,
        projectType,
        minecraftDirectory: settings.minecraftDirectory,
        minecraftVersion: settings.minecraftVersion,
        launchType: settings.launchType
      });
      statusText.textContent = `Installed ${item.title || item.slug}.`;
    } catch (error) {
      statusText.textContent = `Problem: ${error.message}`;
    } finally {
      setBusy(false);
    }
  });

  actions.appendChild(openBtn);
  actions.appendChild(installBtn);

  row.appendChild(title);
  if (meta.textContent) row.appendChild(meta);
  if (desc.textContent) row.appendChild(desc);
  row.appendChild(actions);
  return row;
}

function renderLibraryList(target, items, query, projectType) {
  const q = String(query || "").trim().toLowerCase();
  const filtered = q
    ? items.filter((item) => {
        const hay = `${item.title || ""} ${item.slug || ""} ${item.description || ""}`.toLowerCase();
        return hay.includes(q);
      })
    : items;

  target.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = q ? "No matches." : "Nothing loaded yet.";
    target.appendChild(empty);
    return;
  }

  filtered.forEach((item) => target.appendChild(libraryItemCard(item, projectType)));
}

async function modrinthSearch({ projectType, category, limit }) {
  const url = new URL("https://api.modrinth.com/v2/search");
  url.searchParams.set("index", "downloads");
  url.searchParams.set("limit", String(limit || 100));
  url.searchParams.set("query", "");
  url.searchParams.set("facets", JSON.stringify([[`project_type:${projectType}`], [`categories:${category}`]]));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Modrinth request failed: ${response.status}`);
  }
  const json = await response.json();
  return Array.isArray(json?.hits) ? json.hits : [];
}

async function ensureLibraryLoaded() {
  if (libraryBusy) return;
  libraryBusy = true;
  try {
    modsList.innerHTML = `<div class="empty-state">Loading mods...</div>`;
    packsList.innerHTML = `<div class="empty-state">Loading resource packs...</div>`;

    const [mods, packs] = await Promise.all([
      modrinthSearch({ projectType: "mod", category: "optimization", limit: 100 }),
      modrinthSearch({ projectType: "resourcepack", category: "pvp", limit: 100 })
    ]);
    modrinthMods = mods;
    modrinthPacks = packs;
    renderLibraryList(modsList, modrinthMods, modsSearch.value, "mod");
    renderLibraryList(packsList, modrinthPacks, packsSearch.value, "resourcepack");
  } catch (error) {
    modsList.innerHTML = `<div class="empty-state">Problem loading mods: ${error.message}</div>`;
    packsList.innerHTML = `<div class="empty-state">Problem loading packs: ${error.message}</div>`;
  } finally {
    libraryBusy = false;
  }
}

refreshModsButton.addEventListener("click", () => {
  modrinthMods = [];
  ensureLibraryLoaded().catch(() => {});
});

refreshPacksButton.addEventListener("click", () => {
  modrinthPacks = [];
  ensureLibraryLoaded().catch(() => {});
});

modsSearch.addEventListener("input", () => renderLibraryList(modsList, modrinthMods, modsSearch.value, "mod"));
packsSearch.addEventListener("input", () => renderLibraryList(packsList, modrinthPacks, packsSearch.value, "resourcepack"));

launchButton.addEventListener("click", async () => {
  setBusy(true);
  progressText.textContent = "";
  statusText.textContent = "Starting Minecraft...";
  try {
    await saveSettings();
    await window.aeroApi.launchGame(collectSettings());
    statusText.textContent = "Minecraft is launching. Watch the built-in log below if something goes wrong.";
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

window.aeroApi.onLog(({ message }) => {
  appendLog(message);
});

window.aeroApi.onStateUpdated((nextState) => {
  syncFromState(nextState);
  const stored = localStorage.getItem("aeroTab");
  if (stored === "skins") renderSkinHead();
  if (stored === "library") ensureLibraryLoaded().catch(() => {});
});

window.aeroApi.onProgress((payload) => {
  if (payload?.task) {
    progressText.textContent = `${payload.task}: ${payload.current}/${payload.total}`;
  }
});

window.aeroApi.onClosed(({ code }) => {
  statusText.textContent = `Minecraft closed with exit code ${code}.`;
  progressText.textContent = "";
});

async function boot() {
  state = await window.aeroApi.getState();
  syncFromState(state);
  setActiveTab(localStorage.getItem("aeroTab") || "launcher");
  await refreshVersions();
  if (localStorage.getItem("aeroTab") === "skins") renderSkinHead();
}

boot().catch((error) => {
  statusText.textContent = `Problem: ${error.message}`;
});
