const accountsList = document.getElementById("accountsList");
const appShell = document.getElementById("appShell");
const heroHelp = document.getElementById("heroHelp");
const statusText = document.getElementById("statusText");
const progressText = document.getElementById("progressText");
const logBox = document.getElementById("logBox");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingBarFill = document.getElementById("loadingBarFill");
const bambooField = document.getElementById("bambooField");
const bambooParticles = document.getElementById("bambooParticles");

const tabLauncher = document.getElementById("tabLauncher");
const tabSettings = document.getElementById("tabSettings");
const tabLibrary = document.getElementById("tabLibrary");
const tabSkins = document.getElementById("tabSkins");
const tabServerPlugins = document.getElementById("tabServerPlugins");
const tabOptimize = document.getElementById("tabOptimize");
const panelLauncher = document.getElementById("panelLauncher");
const panelSettings = document.getElementById("panelSettings");
const panelLibrary = document.getElementById("panelLibrary");
const panelSkins = document.getElementById("panelSkins");
const panelServerPlugins = document.getElementById("panelServerPlugins");
const panelOptimize = document.getElementById("panelOptimize");

const launchType = document.getElementById("launchType");
const minecraftVersion = document.getElementById("minecraftVersion");
const launchTypePicker = document.getElementById("launchTypePicker");
const launchTypeMenu = document.getElementById("launchTypeMenu");
const minecraftVersionPicker = document.getElementById("minecraftVersionPicker");
const minecraftVersionMenu = document.getElementById("minecraftVersionMenu");
const showSnapshots = document.getElementById("showSnapshots");
const memoryMb = document.getElementById("memoryMb");
const minecraftDirectory = document.getElementById("minecraftDirectory");
const javaPath = document.getElementById("javaPath");

const discordEnabled = document.getElementById("discordEnabled");
const discordShowLauncher = document.getElementById("discordShowLauncher");
const discordShowPlaying = document.getElementById("discordShowPlaying");

const skinPreviewBox = document.getElementById("skinPreviewBox");
const skinPreviewMeta = document.getElementById("skinPreviewMeta");
const refreshSkinButton = document.getElementById("refreshSkinButton");
const skinVariant = document.getElementById("skinVariant");
const skinFileInput = document.getElementById("skinFileInput");
const uploadSkinButton = document.getElementById("uploadSkinButton");
const skinUploadMeta = document.getElementById("skinUploadMeta");
const updateNotice = document.getElementById("updateNotice");
const updateNoticeText = document.getElementById("updateNoticeText");
const updateNoticeButton = document.getElementById("updateNoticeButton");

const refreshModsButton = document.getElementById("refreshModsButton");
const refreshPacksButton = document.getElementById("refreshPacksButton");
const openModsFolderButton = document.getElementById("openModsFolderButton");
const openPacksFolderButton = document.getElementById("openPacksFolderButton");
const modsSearch = document.getElementById("modsSearch");
const packsSearch = document.getElementById("packsSearch");
const modsList = document.getElementById("modsList");
const packsList = document.getElementById("packsList");
const refreshOptimizationsButton = document.getElementById("refreshOptimizationsButton");
const optimizationsList = document.getElementById("optimizationsList");
const serverPluginAddress = document.getElementById("serverPluginAddress");
const serverPluginCodeInput = document.getElementById("serverPluginCodeInput");
const authorizeServerPluginsButton = document.getElementById("authorizeServerPluginsButton");
const serverPluginAuthStatus = document.getElementById("serverPluginAuthStatus");
const refreshServerPluginsButton = document.getElementById("refreshServerPluginsButton");
const serverPluginSearch = document.getElementById("serverPluginSearch");
const serverPluginResults = document.getElementById("serverPluginResults");
const serverPluginInstalledList = document.getElementById("serverPluginInstalledList");

const microsoftButton = document.getElementById("microsoftButton");
const removeAccountButton = document.getElementById("removeAccountButton");
const offlineButton = document.getElementById("offlineButton");
const refreshVersionsButton = document.getElementById("refreshVersionsButton");
const launchButton = document.getElementById("launchButton");

const offlineUsername = document.getElementById("offlineUsername");
const offlineUuid = document.getElementById("offlineUuid");

let state = null;
let versions = { vanilla: [], fabric: [], quilt: [], forge: [], neoforge: [] };
let busy = false;
// Panda + bubble visuals were removed per request.
let libraryBusy = false;
let modrinthMods = [];
let modrinthPacks = [];
let modsSearchTimer = null;
let lastModsQuery = null;
let packsLoaded = false;
let updateStatus = null;
let skinRenderNonce = 0;
const installedLibraryItems = new Set();
let installedLibraryScan = { mods: [], resourcepacks: [] };
let optimizations = [];
let optimizationBusy = false;
let bootFinished = false;
let loadingFinished = false;
let activeEnhancedSelect = null;
let serverPluginState = { servers: [] };
let serverPluginResultsCache = [];
let serverPluginBusy = false;
const activeBamboo = new Map();
const BAMBOO_COUNT = 5;

function setBusy(nextBusy) {
  busy = nextBusy;
  [
    microsoftButton,
    removeAccountButton,
    offlineButton,
    refreshVersionsButton,
    launchButton,
    refreshSkinButton,
    uploadSkinButton,
    openModsFolderButton,
    openPacksFolderButton,
    refreshModsButton,
    refreshPacksButton,
    refreshOptimizationsButton,
    authorizeServerPluginsButton,
    refreshServerPluginsButton
  ].forEach((button) => {
    if (button) button.disabled = nextBusy;
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maybeFinishLoading() {
  if (!bootFinished || !loadingFinished) return;
  loadingOverlay.classList.add("hidden");
  appShell.classList.add("ready");
}

function startLoadingSequence() {
  const duration = 1000 + Math.floor(Math.random() * 4000);
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    loadingBarFill.style.width = `${Math.round(progress * 100)}%`;
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      loadingFinished = true;
      maybeFinishLoading();
    }
  }

  requestAnimationFrame(tick);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickBambooLeftPercent() {
  const lane = Math.random() < 0.5 ? "left" : "right";
  if (lane === "left") return randomBetween(2, 13);
  return randomBetween(87, 97);
}

function createBambooStalk(id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bamboo-stalk";
  button.dataset.id = String(id);
  button.style.left = `${pickBambooLeftPercent()}%`;
  button.style.height = `${Math.round(randomBetween(180, 260))}px`;
  button.style.opacity = String(randomBetween(0.76, 0.98));
  button.innerHTML = `
    <span class="bamboo-leaf leaf-left"></span>
    <span class="bamboo-leaf leaf-right"></span>
  `;

  button.addEventListener("click", (event) => breakBamboo(button, event));
  activeBamboo.set(id, button);
  bambooField.appendChild(button);
}

function spawnBambooParticles(originX, originY) {
  for (let i = 0; i < 12; i += 1) {
    const particle = document.createElement("div");
    particle.className = "bamboo-particle";
    particle.style.left = `${originX + randomBetween(-18, 18)}px`;
    particle.style.top = `${originY + randomBetween(-12, 12)}px`;
    particle.style.setProperty("--drift-x", `${randomBetween(-48, 48)}px`);
    particle.style.setProperty("--drift-y", `${randomBetween(70, 170)}px`);
    particle.style.setProperty("--spin", `${randomBetween(-220, 220)}deg`);
    particle.style.width = `${randomBetween(4, 8)}px`;
    particle.style.height = `${randomBetween(10, 20)}px`;
    bambooParticles.appendChild(particle);
    setTimeout(() => particle.remove(), 1900);
  }
}

function respawnBamboo(oldId) {
  activeBamboo.delete(oldId);
  createBambooStalk(oldId);
}

function createBambooTopFragment(button, rect, snapY, angleClass) {
  const fragment = document.createElement("div");
  fragment.className = `bamboo-top-fragment ${angleClass}`;
  fragment.style.left = `${rect.left}px`;
  fragment.style.top = `${rect.top}px`;
  fragment.style.width = `${rect.width}px`;
  fragment.style.height = `${snapY}px`;
  fragment.style.opacity = button.style.opacity || "0.92";
  fragment.innerHTML = button.innerHTML;
  bambooField.appendChild(fragment);
  requestAnimationFrame(() => fragment.classList.add("falling"));
  setTimeout(() => fragment.remove(), 2000);
}

async function breakBamboo(button, event) {
  if (!button || button.classList.contains("snapped")) return;

  const angleClass = Math.random() < 0.5 ? "angle-a" : "angle-b";
  const rect = button.getBoundingClientRect();
  const clickY = typeof event?.clientY === "number" ? event.clientY - rect.top : rect.height * 0.42;
  const snapY = Math.max(56, Math.min(rect.height - 34, clickY));
  const stumpHeight = Math.max(34, rect.height - snapY);

  createBambooTopFragment(button, rect, snapY, angleClass);
  button.classList.add("snapped");
  button.style.height = `${Math.round(stumpHeight)}px`;
  button.style.opacity = String(Math.max(0.68, Number(button.style.opacity || 0.9) - 0.08));
  button.innerHTML = "";
  spawnBambooParticles(rect.left + rect.width / 2, rect.top + snapY);

  const id = Number(button.dataset.id || 0);
  setTimeout(() => {
    button.remove();
    respawnBamboo(id);
  }, 2000);
}

function seedBambooField() {
  bambooField.innerHTML = "";
  bambooParticles.innerHTML = "";
  activeBamboo.clear();
  for (let i = 0; i < BAMBOO_COUNT; i += 1) {
    createBambooStalk(i);
  }
}

function loaderKey(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "fabric") return "fabric";
  if (normalized === "quilt") return "quilt";
  if (normalized === "forge") return "forge";
  if (normalized === "neoforge") return "neoforge";
  return "vanilla";
}

function setNativeSelectValue(selectElement, value) {
  const nextValue = String(value || "");
  const option = Array.from(selectElement.options).find((item) => item.value === nextValue || item.textContent === nextValue);
  if (option) {
    selectElement.value = option.value;
  }
}

function closeEnhancedSelect() {
  if (!activeEnhancedSelect) return;
  activeEnhancedSelect.menu.hidden = true;
  activeEnhancedSelect.trigger.setAttribute("aria-expanded", "false");
  activeEnhancedSelect = null;
}

function toggleEnhancedSelect(trigger, menu, selectElement) {
  if (activeEnhancedSelect?.menu === menu) {
    closeEnhancedSelect();
    return;
  }
  closeEnhancedSelect();
  renderEnhancedSelectMenu(selectElement, trigger, menu);
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  activeEnhancedSelect = { trigger, menu, selectElement };
}

function renderEnhancedSelectMenu(selectElement, trigger, menu) {
  const selectedValue = selectElement.value;
  menu.innerHTML = "";
  Array.from(selectElement.options).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `enhanced-select-option${option.value === selectedValue ? " selected" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", option.value === selectedValue ? "true" : "false");
    button.textContent = option.textContent;
    button.addEventListener("click", () => {
      selectElement.value = option.value;
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));
      closeEnhancedSelect();
    });
    menu.appendChild(button);
  });

  requestAnimationFrame(() => {
    const selected = menu.querySelector(".enhanced-select-option.selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  });
  updateEnhancedSelectTrigger(selectElement, trigger);
}

function updateEnhancedSelectTrigger(selectElement, trigger) {
  const selected = selectElement.selectedOptions?.[0];
  trigger.textContent = selected?.textContent || "Choose";
}

function syncEnhancedSelects() {
  updateEnhancedSelectTrigger(launchType, launchTypePicker);
  updateEnhancedSelectTrigger(minecraftVersion, minecraftVersionPicker);
  if (activeEnhancedSelect) {
    renderEnhancedSelectMenu(activeEnhancedSelect.selectElement, activeEnhancedSelect.trigger, activeEnhancedSelect.menu);
  }
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
  setNativeSelectValue(launchType, state.settings.launchType || "Vanilla");
  showSnapshots.checked = Boolean(state.settings.showSnapshots);
  memoryMb.value = state.settings.memoryMb || 4096;
  minecraftDirectory.value = state.settings.minecraftDirectory || "";
  javaPath.value = state.settings.javaPath || "";
  discordEnabled.value = state.settings.discordPresenceEnabled ? "on" : "off";
  discordShowLauncher.value = state.settings.discordShowLauncher ? "on" : "off";
  discordShowPlaying.value = state.settings.discordShowPlaying ? "on" : "off";
  renderVersions();
  syncEnhancedSelects();
}

function renderVersions() {
  const key = loaderKey(launchType.value);
  const allItems = versions[key] || [];
  const items = showSnapshots.checked ? allItems : allItems.filter((version) => !isSnapshotVersion(version));
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
  syncEnhancedSelects();
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

function currentServerPluginProfile() {
  const address = String(serverPluginAddress?.value || "").trim().toLowerCase();
  if (!address) return null;
  return (serverPluginState.servers || []).find((server) => String(server.address || "").toLowerCase() === address) || null;
}

function renderServerPluginInstalled() {
  if (!serverPluginInstalledList) return;
  const profile = currentServerPluginProfile();
  serverPluginInstalledList.innerHTML = "";
  if (!profile) {
    serverPluginInstalledList.innerHTML = `<div class="empty-state">Type or authorize a server to see its installed plugins.</div>`;
    return;
  }
  const installed = Array.isArray(profile.installedPlugins) ? profile.installedPlugins : [];
  if (!installed.length) {
    serverPluginInstalledList.innerHTML = `<div class="empty-state">No plugins installed yet. Folder: ${profile.pluginsDir || "not created yet"}</div>`;
    return;
  }
  installed.forEach((plugin) => {
    const card = document.createElement("div");
    card.className = "friend-card";
    const name = document.createElement("div");
    name.className = "friend-name";
    name.textContent = plugin.title || plugin.fileName || "Plugin";
    const meta = document.createElement("div");
    meta.className = "friend-address static";
    meta.textContent = `${plugin.source || "plugin"} • ${plugin.fileName || ""}`;
    card.append(name, meta);
    serverPluginInstalledList.appendChild(card);
  });
}

function renderServerPluginAuth() {
  const profile = currentServerPluginProfile();
  if (!serverPluginAuthStatus) return;
  if (!profile) {
    serverPluginAuthStatus.textContent = "Authorize before installing plugins.";
  } else if (profile.authorized) {
    serverPluginAuthStatus.textContent = `Authorized. Installs go to ${profile.pluginsDir}`;
  } else if (profile.codeUsed) {
    serverPluginAuthStatus.textContent = "Code was already used. Create a new host code.";
  } else {
    serverPluginAuthStatus.textContent = "Code created. Type it here once to unlock installs.";
  }
  renderServerPluginInstalled();
}

function serverPluginCard(item) {
  const row = document.createElement("div");
  row.className = "library-item";

  const title = document.createElement("div");
  title.className = "library-item-title";
  title.textContent = item.title || "Unknown plugin";

  const meta = document.createElement("div");
  meta.className = "library-item-meta";
  meta.textContent = `${item.source === "spigot" ? "Spigot" : "Modrinth"} • ${formatDownloads(item.downloads)} downloads`;

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
    if (item.url) window.aeroApi.openExternal(item.url).catch(() => {});
  });

  const installBtn = document.createElement("button");
  installBtn.className = "primary";
  installBtn.type = "button";
  installBtn.textContent = "Install";
  installBtn.disabled = serverPluginBusy || !currentServerPluginProfile()?.authorized;
  installBtn.addEventListener("click", async () => {
    serverPluginBusy = true;
    installBtn.disabled = true;
    installBtn.textContent = "Installing...";
    statusText.textContent = `Installing ${item.title} into server plugins...`;
    try {
      await window.aeroApi.installServerPlugin({
        address: serverPluginAddress.value,
        source: item.source,
        id: item.id,
        title: item.title
      });
      serverPluginState = await window.aeroApi.getServerPluginsState();
      installBtn.textContent = "Installed";
      installBtn.className = "ghost";
      statusText.textContent = `Installed ${item.title}.`;
      renderServerPluginAuth();
    } catch (error) {
      installBtn.textContent = "Install";
      installBtn.disabled = false;
      statusText.textContent = `Problem: ${error.message}`;
    } finally {
      serverPluginBusy = false;
    }
  });

  actions.append(openBtn, installBtn);
  row.append(title, meta);
  if (desc.textContent) row.append(desc);
  row.append(actions);
  return row;
}

function renderServerPluginResults() {
  if (!serverPluginResults) return;
  serverPluginResults.innerHTML = "";
  if (!serverPluginResultsCache.length) {
    serverPluginResults.innerHTML = `<div class="empty-state">No plugin results loaded yet.</div>`;
    return;
  }
  serverPluginResultsCache.forEach((item) => serverPluginResults.appendChild(serverPluginCard(item)));
}

async function loadServerPluginState() {
  if (!serverPluginAddress) return;
  serverPluginState = await window.aeroApi.getServerPluginsState();
  if (!serverPluginAddress.value && Array.isArray(serverPluginState.servers) && serverPluginState.servers[0]) {
    serverPluginAddress.value = serverPluginState.servers[0].address || "";
  }
  renderServerPluginAuth();
}

async function searchServerPlugins() {
  if (!serverPluginResults) return;
  serverPluginResults.innerHTML = `<div class="empty-state">Searching trusted plugin sources...</div>`;
  try {
    serverPluginResultsCache = await window.aeroApi.searchServerPlugins({
      query: serverPluginSearch.value
    });
    renderServerPluginResults();
    statusText.textContent = `Found ${serverPluginResultsCache.length} high-use server plugins.`;
  } catch (error) {
    serverPluginResults.innerHTML = `<div class="empty-state">Problem: ${error.message}</div>`;
    statusText.textContent = `Problem: ${error.message}`;
  }
}

function isSnapshotVersion(version) {
  const value = String(version || "").trim().toLowerCase();
  if (!value) return false;
  if (/^\d{2}w\d{2}[a-z]$/.test(value)) return true;
  if (/^1\.\d+(?:\.\d+)?-(pre|rc)\d+$/.test(value)) return true;
  return !/^1\.\d+(?:\.\d+)?$/.test(value);
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

function headPreviewCandidates(account, profile) {
  const username = String(profile?.name || account?.username || "").trim();
  const rawUuid = String(profile?.id || account?.uuid || "").trim();
  const cleanUuid = rawUuid.replace(/-/g, "");
  const stamp = Date.now();
  const urls = [];

  if (cleanUuid) {
    urls.push(`https://crafatar.com/avatars/${encodeURIComponent(cleanUuid)}?size=128&overlay&cb=${stamp}`);
    urls.push(`https://mc-heads.net/avatar/${encodeURIComponent(cleanUuid)}/128`);
  }
  if (username) {
    urls.push(`https://minotar.net/helm/${encodeURIComponent(username)}/128.png?cb=${stamp}`);
    urls.push(`https://mc-heads.net/avatar/${encodeURIComponent(username)}/128`);
  }
  return urls;
}

async function loadFirstWorkingImage(urls) {
  for (const url of urls) {
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      return url;
    } catch {
      // Keep trying fallbacks.
    }
  }
  return "";
}

function renderUpdateNotice() {
  if (!updateStatus?.visible || !updateStatus?.message) {
    updateNotice.hidden = true;
    updateNoticeButton.hidden = true;
    updateNoticeText.textContent = "";
    return;
  }

  updateNotice.hidden = false;
  updateNoticeText.textContent = updateStatus.message;
  updateNoticeButton.disabled = false;

  if (updateStatus.action === "download" || updateStatus.action === "install") {
    updateNoticeButton.hidden = false;
    updateNoticeButton.textContent = updateStatus.action === "install" ? "Restart to update" : "Update now";
  } else {
    updateNoticeButton.hidden = true;
  }
}

function updateSkinControls() {
  const selected = getSelectedAccount();
  const canUpload = Boolean(selected && selected.type === "microsoft");

  uploadSkinButton.disabled = busy || !canUpload;
  skinVariant.disabled = busy || !canUpload;
  skinFileInput.disabled = busy || !canUpload;

  if (!selected) {
    skinUploadMeta.textContent = "Choose an account to refresh or upload a skin.";
    return;
  }

  if (!canUpload) {
    skinUploadMeta.textContent = "Skin changing only works for Microsoft accounts.";
    return;
  }

  const picked = skinFileInput.files?.[0]?.name;
  skinUploadMeta.textContent = picked
    ? `Ready to upload ${picked} as a ${skinVariant.value} skin.`
    : "Choose a PNG skin file to upload for the selected Microsoft account.";
}

async function renderSkinHead() {
  const nonce = ++skinRenderNonce;
  const selected = getSelectedAccount();
  if (!selected) {
    skinPreviewBox.innerHTML = `<div class="empty-state">Select an account to load skin info.</div>`;
    skinPreviewMeta.textContent = "";
    updateSkinControls();
    return;
  }

  skinPreviewBox.innerHTML = `<div class="empty-state">Loading skin preview...</div>`;
  skinPreviewMeta.textContent = selected.type === "microsoft" ? "Checking your current skin..." : selected.username;

  let profile = null;
  if (selected.type === "microsoft") {
    try {
      profile = await window.aeroApi.getSkinProfile();
    } catch {
      profile = null;
    }
  }

  const url = await loadFirstWorkingImage(headPreviewCandidates(selected, profile));
  if (nonce !== skinRenderNonce) return;

  if (!url) {
    skinPreviewBox.innerHTML = `<div class="empty-state">No skin info available for this account.</div>`;
    skinPreviewMeta.textContent = selected.username || "";
    updateSkinControls();
    return;
  }

  skinPreviewBox.innerHTML = `<img alt="Minecraft skin head preview" referrerpolicy="no-referrer" src="${url}" />`;
  skinPreviewMeta.textContent = String(profile?.name || selected.username || "").trim();
  updateSkinControls();
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
  if (line.includes("joining server")) {
    statusText.textContent = "Enjoy!";
  } else if (
    line.includes("loading world") ||
    line.includes("joining world") ||
    line.includes("starting integrated server") ||
    line.includes("preparing spawn area") ||
    line.includes("connecting to")
  ) {
    statusText.textContent = "Loading peace...";
  } else if (line.includes("generating terrain") || line.includes("loading terrain")) {
    statusText.textContent = "Giving you peace...";
  }
}

// (Bubble popping removed.)

function syncFromState(nextState) {
  state = nextState;
  updateStatus = nextState.updateStatus || updateStatus;
  applyBackgroundPreset(state?.settings?.backgroundPreset);
  logBox.textContent = "";
  (state.log || []).forEach((line) => appendLog(line));
  renderAccounts();
  renderSettings();
  renderHero();
  renderUpdateNotice();
  updateSkinControls();
}

function collectSettings() {
  return {
    launchType: launchType.value,
    minecraftVersion: minecraftVersion.value,
    minecraftDirectory: minecraftDirectory.value.trim(),
    javaPath: javaPath.value.trim(),
    memoryMb: Number(memoryMb.value || 4096),
    backgroundPreset: state?.settings?.backgroundPreset || "bamboo",
    showSnapshots: showSnapshots.checked,
    discordPresenceEnabled: discordEnabled.value === "on",
    discordAppId: state?.settings?.discordAppId || "",
    discordShowLauncher: discordShowLauncher.value === "on",
    discordShowPlaying: discordShowPlaying.value === "on"
  };
}

function collectLibraryContext() {
  const settings = collectSettings();
  return {
    minecraftDirectory: settings.minecraftDirectory,
    minecraftVersion: settings.minecraftVersion,
    launchType: settings.launchType
  };
}

function collectOptimizationContext() {
  return collectLibraryContext();
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
    { name: "skins", button: tabSkins, panel: panelSkins },
    { name: "server-plugins", button: tabServerPlugins, panel: panelServerPlugins },
    { name: "optimize", button: tabOptimize, panel: panelOptimize }
  ];
  if (!tabs.some((tab) => tab.name === tabName)) tabName = "launcher";
  tabs.forEach(({ name, button, panel }) => {
    const active = name === tabName;
    button.classList.toggle("active", active);
    panel.classList.toggle("active", active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });
  localStorage.setItem("aeroTab", tabName);
  if (tabName === "skins") renderSkinHead();
  if (tabName === "server-plugins") loadServerPluginState().catch(() => {});
  if (tabName === "library") ensureLibraryLoaded().catch(() => {});
  if (tabName === "optimize") loadOptimizations().catch(() => {});
}

tabLauncher.addEventListener("click", () => setActiveTab("launcher"));
tabSettings.addEventListener("click", () => setActiveTab("settings"));
tabLibrary.addEventListener("click", () => setActiveTab("library"));
tabSkins.addEventListener("click", () => setActiveTab("skins"));
tabServerPlugins.addEventListener("click", () => setActiveTab("server-plugins"));
tabOptimize.addEventListener("click", () => setActiveTab("optimize"));

launchTypePicker.addEventListener("click", () => toggleEnhancedSelect(launchTypePicker, launchTypeMenu, launchType));
minecraftVersionPicker.addEventListener("click", () => toggleEnhancedSelect(minecraftVersionPicker, minecraftVersionMenu, minecraftVersion));

document.addEventListener("click", (event) => {
  if (!activeEnhancedSelect) return;
  const target = event.target;
  if (activeEnhancedSelect.trigger.contains(target) || activeEnhancedSelect.menu.contains(target)) return;
  closeEnhancedSelect();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeEnhancedSelect();
});

serverPluginAddress.addEventListener("change", () => {
  loadServerPluginState().catch(() => {});
});

authorizeServerPluginsButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await window.aeroApi.authorizeServerPlugins({
      address: serverPluginAddress.value,
      code: serverPluginCodeInput.value
    });
    await loadServerPluginState();
    renderServerPluginResults();
    statusText.textContent = "Server authorized for plugin installs.";
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
  }
});

refreshServerPluginsButton.addEventListener("click", () => {
  searchServerPlugins().catch(() => {});
});

serverPluginSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchServerPlugins().catch(() => {});
  }
});

launchType.addEventListener("change", async () => {
  renderVersions();
  syncEnhancedSelects();
  await saveSettings();
  if (localStorage.getItem("aeroTab") === "optimize") loadOptimizations().catch(() => {});
});

[memoryMb, minecraftDirectory, javaPath, showSnapshots, discordEnabled, discordShowLauncher, discordShowPlaying].forEach((element) => {
  element.addEventListener("change", async () => {
    if (element === showSnapshots) renderVersions();
    syncEnhancedSelects();
    await saveSettings();
    if ((element === minecraftDirectory || element === javaPath) && localStorage.getItem("aeroTab") === "optimize") {
      loadOptimizations().catch(() => {});
    }
  });
});

minecraftDirectory.addEventListener("change", () => {
  if (localStorage.getItem("aeroTab") === "library") {
    ensureLibraryLoaded().catch(() => {});
  }
});

minecraftVersion.addEventListener("change", async () => {
  syncEnhancedSelects();
  await saveSettings();
  if (localStorage.getItem("aeroTab") === "optimize") loadOptimizations().catch(() => {});
});

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

refreshSkinButton.addEventListener("click", () => renderSkinHead());
skinVariant.addEventListener("change", updateSkinControls);
skinFileInput.addEventListener("change", updateSkinControls);
uploadSkinButton.addEventListener("click", async () => {
  const selected = getSelectedAccount();
  const file = skinFileInput.files?.[0];

  if (!selected) {
    statusText.textContent = "Choose an account first.";
    return;
  }
  if (selected.type !== "microsoft") {
    statusText.textContent = "Skin changing only works for Microsoft accounts.";
    return;
  }
  if (!file) {
    statusText.textContent = "Choose a PNG skin file first.";
    return;
  }

  setBusy(true);
  statusText.textContent = "Uploading skin...";
  try {
    const buffer = await file.arrayBuffer();
    await window.aeroApi.uploadSkin({
      variant: skinVariant.value,
      bytes: Array.from(new Uint8Array(buffer))
    });
    skinFileInput.value = "";
    updateSkinControls();
    statusText.textContent = "Skin uploaded. Refreshing preview...";
    await renderSkinHead();
    statusText.textContent = "Skin uploaded.";
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
  }
});
updateNoticeButton.addEventListener("click", async () => {
  if (!updateStatus?.action) return;
  updateNoticeButton.disabled = true;
  try {
    if (updateStatus.action === "download") {
      await window.aeroApi.startUpdateDownload();
    } else if (updateStatus.action === "install") {
      await window.aeroApi.installUpdateNow();
    }
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    updateNoticeButton.disabled = false;
  }
});

function formatDownloads(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}b`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}m`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function libraryInstallKey(item, projectType) {
  const settings = collectSettings();
  const root = String(settings.minecraftDirectory || "").trim().toLowerCase();
  const loader = String(settings.launchType || "").trim().toLowerCase();
  const version = String(settings.minecraftVersion || "").trim().toLowerCase();
  const id = String(item?.project_id || item?.slug || item?.title || "").trim().toLowerCase();
  return `${projectType}:${root}:${loader}:${version}:${id}`;
}

function normalizeLibraryToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.(jar|zip)$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function itemLooksInstalled(item, projectType) {
  const installKey = libraryInstallKey(item, projectType);
  if (installedLibraryItems.has(installKey)) return true;

  const folderEntries =
    projectType === "mod" ? installedLibraryScan.mods || [] : installedLibraryScan.resourcepacks || [];
  if (!folderEntries.length) return false;

  const needles = [item?.slug, item?.project_id, item?.title]
    .map(normalizeLibraryToken)
    .filter(Boolean);

  return folderEntries.some((entry) => {
    const haystack = normalizeLibraryToken(entry);
    return needles.some((needle) => haystack.includes(needle) || needle.includes(haystack));
  });
}

async function refreshInstalledLibraryScan() {
  installedLibraryScan = await window.aeroApi.scanInstalledLibrary(collectLibraryContext());
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
  const installKey = libraryInstallKey(item, projectType);
  const installed = itemLooksInstalled(item, projectType);
  installBtn.className = installed ? "ghost" : "primary";
  installBtn.type = "button";
  installBtn.textContent = installed ? "Installed" : "Install";
  installBtn.disabled = installed;
  installBtn.addEventListener("click", async () => {
    if (installedLibraryItems.has(installKey)) return;
    const settings = collectSettings();
    setBusy(true);
    statusText.textContent = `Installing ${item.title || item.slug}...`;
    try {
      await window.aeroApi.installModrinth({
        projectId: item.project_id,
        projectType,
        ...collectLibraryContext()
      });
      installedLibraryItems.add(installKey);
      await refreshInstalledLibraryScan();
      installBtn.textContent = "Installed";
      installBtn.disabled = true;
      installBtn.className = "ghost";
      statusText.textContent = `Installed ${item.title || item.slug}.`;
      renderLibraryList(
        projectType === "mod" ? modsList : packsList,
        projectType === "mod" ? modrinthMods : modrinthPacks,
        projectType === "mod" ? modsSearch.value : packsSearch.value,
        projectType
      );
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

async function modrinthSearch({ projectType, category, query, limit }) {
  const url = new URL("https://api.modrinth.com/v2/search");
  url.searchParams.set("index", "downloads");
  url.searchParams.set("limit", String(limit || 100));
  url.searchParams.set("query", String(query || ""));
  const facets = [[`project_type:${projectType}`]];
  if (category) facets.push([`categories:${category}`]);
  if (projectType === "mod") {
    const selectedVersion = String(minecraftVersion.value || "").trim();
    const selectedLoader = loaderKey(launchType.value);
    if (selectedVersion) {
      facets.push([`versions:${selectedVersion}`]);
    }
    if (selectedLoader !== "vanilla") {
      facets.push([`categories:${selectedLoader}`]);
    }
  }
  url.searchParams.set("facets", JSON.stringify(facets));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Modrinth request failed: ${response.status}`);
  }
  const json = await response.json();
  return Array.isArray(json?.hits) ? json.hits : [];
}

async function loadModsFromModrinth(query) {
  const trimmed = String(query || "").trim();
  const selectedLoader = loaderKey(launchType.value);
  if (selectedLoader === "vanilla") {
    return [];
  }
  if (trimmed) {
    return modrinthSearch({ projectType: "mod", query: trimmed, limit: 100 });
  }
  return modrinthSearch({ projectType: "mod", category: "optimization", limit: 100 });
}

async function ensureLibraryLoaded() {
  if (libraryBusy) return;
  libraryBusy = true;
  try {
    const requestedModsQuery = String(modsSearch.value || "").trim();
    const selectedLoader = loaderKey(launchType.value);
    if (selectedLoader === "vanilla") {
      modsList.innerHTML = `<div class="empty-state">Switch Launch type to Fabric, Quilt, Forge, or NeoForge to browse compatible mods.</div>`;
    } else {
      modsList.innerHTML = `<div class="empty-state">Loading mods...</div>`;
    }
    if (!packsLoaded) {
      packsList.innerHTML = `<div class="empty-state">Loading resource packs...</div>`;
    }

    const work = [selectedLoader === "vanilla" ? Promise.resolve([]) : loadModsFromModrinth(requestedModsQuery)];
    if (!packsLoaded) {
      work.push(modrinthSearch({ projectType: "resourcepack", category: "combat", query: "pvp", limit: 100 }));
    }

    const results = await Promise.all(work);
    const [mods, packs] = results;
    await refreshInstalledLibraryScan();
    modrinthMods = mods;
    lastModsQuery = requestedModsQuery;
    if (!packsLoaded) {
      modrinthPacks = packs;
      packsLoaded = true;
    }
    renderLibraryList(modsList, modrinthMods, "", "mod");
    renderLibraryList(packsList, modrinthPacks, packsSearch.value, "resourcepack");
  } catch (error) {
    modsList.innerHTML = `<div class="empty-state">Problem loading mods: ${error.message}</div>`;
    if (!packsLoaded) {
      packsList.innerHTML = `<div class="empty-state">Problem loading packs: ${error.message}</div>`;
    }
  } finally {
    libraryBusy = false;
  }
}

function optimizationStatusLabel(item) {
  if (item.status === "applied") return "Applied by Zen";
  if (item.status === "already-done") return "Already done";
  return "Available";
}

function optimizationCard(item) {
  const card = document.createElement("article");
  card.className = `optimization-card optimization-${item.status}`;

  const top = document.createElement("div");
  top.className = "optimization-top";

  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.className = "optimization-title";
  title.textContent = item.title;
  const meta = document.createElement("div");
  meta.className = "optimization-meta";
  meta.textContent = `${item.category} • ${item.risky ? "Risky" : "Low risk"} • ${optimizationStatusLabel(item)}`;
  titleWrap.append(title, meta);

  const badge = document.createElement("div");
  badge.className = `optimization-badge optimization-badge-${item.status}`;
  badge.textContent = optimizationStatusLabel(item);

  top.append(titleWrap, badge);

  const description = document.createElement("div");
  description.className = "optimization-description";
  description.textContent = item.description;

  const risk = document.createElement("div");
  risk.className = `optimization-risk${item.risky ? " risky" : ""}`;
  risk.textContent = item.risky
    ? `Risk note: ${item.riskReason}`
    : "Risk note: This one is a gentle change and is easy to undo.";

  const actions = document.createElement("div");
  actions.className = "optimization-actions";

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = item.status === "available" ? "primary" : "ghost";
  applyBtn.textContent = "Apply";
  applyBtn.disabled = optimizationBusy || busy || item.status !== "available";
  applyBtn.addEventListener("click", async () => {
    optimizationBusy = true;
    renderOptimizations();
    statusText.textContent = `Applying ${item.title}...`;
    try {
      await window.aeroApi.applyOptimization({
        id: item.id,
        ...collectOptimizationContext()
      });
      statusText.textContent = `${item.title} applied.`;
      optimizationBusy = false;
      await loadOptimizations(true);
    } catch (error) {
      statusText.textContent = `Problem: ${error.message}`;
    } finally {
      optimizationBusy = false;
      renderOptimizations();
    }
  });

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "ghost";
  undoBtn.textContent = "Undo";
  undoBtn.disabled = optimizationBusy || busy || item.status === "available";
  undoBtn.addEventListener("click", async () => {
    optimizationBusy = true;
    renderOptimizations();
    statusText.textContent = `Undoing ${item.title}...`;
    try {
      await window.aeroApi.undoOptimization({
        id: item.id,
        ...collectOptimizationContext()
      });
      statusText.textContent = `${item.title} restored.`;
      optimizationBusy = false;
      await loadOptimizations(true);
    } catch (error) {
      statusText.textContent = `Problem: ${error.message}`;
    } finally {
      optimizationBusy = false;
      renderOptimizations();
    }
  });

  actions.append(applyBtn, undoBtn);
  card.append(top, description, risk, actions);
  return card;
}

function renderOptimizations() {
  optimizationsList.innerHTML = "";
  if (!optimizations.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No optimization data loaded yet.";
    optimizationsList.appendChild(empty);
    return;
  }
  optimizations.forEach((item) => optimizationsList.appendChild(optimizationCard(item)));
}

async function loadOptimizations(force = false) {
  if (optimizationBusy && !force) return;
  optimizationBusy = true;
  optimizationsList.innerHTML = `<div class="empty-state">Checking 30 optimization items...</div>`;
  try {
    optimizations = await window.aeroApi.listOptimizations(collectOptimizationContext());
    renderOptimizations();
    const activeCount = optimizations.filter((item) => item.status !== "available").length;
    statusText.textContent = `${activeCount} of ${optimizations.length} optimization checks are already active.`;
  } catch (error) {
    optimizationsList.innerHTML = `<div class="empty-state">Problem: ${error.message}</div>`;
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    optimizationBusy = false;
    renderOptimizations();
  }
}

refreshModsButton.addEventListener("click", () => {
  modrinthMods = [];
  lastModsQuery = null;
  ensureLibraryLoaded().catch(() => {});
});

openModsFolderButton.addEventListener("click", async () => {
  const settings = collectSettings();
  try {
    const result = await window.aeroApi.openFolder({
      ...collectLibraryContext(),
      kind: "mods"
    });
    statusText.textContent = `Opened mods folder: ${result.path}`;
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  }
});

openPacksFolderButton.addEventListener("click", async () => {
  const settings = collectSettings();
  try {
    const result = await window.aeroApi.openFolder({
      ...collectLibraryContext(),
      kind: "resourcepacks"
    });
    statusText.textContent = `Opened resource packs folder: ${result.path}`;
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  }
});

refreshPacksButton.addEventListener("click", () => {
  modrinthPacks = [];
  packsLoaded = false;
  ensureLibraryLoaded().catch(() => {});
});

modsSearch.addEventListener("input", () => {
  const query = String(modsSearch.value || "").trim();
  clearTimeout(modsSearchTimer);

  if (!query) {
    if (lastModsQuery !== "") {
      modsList.innerHTML = `<div class="empty-state">Loading popular performance mods...</div>`;
      modsSearchTimer = setTimeout(() => ensureLibraryLoaded().catch(() => {}), 120);
      return;
    }
    renderLibraryList(modsList, modrinthMods, "", "mod");
    return;
  }

  if (query.length < 2) {
    renderLibraryList(modsList, modrinthMods, query, "mod");
    return;
  }

  modsList.innerHTML = `<div class="empty-state">Searching Modrinth for "${query}"...</div>`;
  modsSearchTimer = setTimeout(() => ensureLibraryLoaded().catch(() => {}), 260);
});
packsSearch.addEventListener("input", () => renderLibraryList(packsList, modrinthPacks, packsSearch.value, "resourcepack"));
refreshOptimizationsButton.addEventListener("click", () => loadOptimizations().catch(() => {}));

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
  if (stored === "optimize") loadOptimizations().catch(() => {});
  if (stored === "server-plugins") loadServerPluginState().catch(() => {});
});

window.aeroApi.onUpdateStatus((nextStatus) => {
  updateStatus = nextStatus;
  renderUpdateNotice();
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
  startLoadingSequence();
  seedBambooField();
  state = await window.aeroApi.getState();
  syncFromState(state);
  const storedTab = localStorage.getItem("aeroTab") || "launcher";
  setActiveTab(storedTab === "games" ? "launcher" : storedTab);
  await refreshVersions();
  if (storedTab === "skins") renderSkinHead();
  if (storedTab === "library") ensureLibraryLoaded().catch(() => {});
  if (storedTab === "optimize") loadOptimizations().catch(() => {});
  if (storedTab === "server-plugins") loadServerPluginState().catch(() => {});
  bootFinished = true;
  maybeFinishLoading();
}

boot().catch((error) => {
  statusText.textContent = `Problem: ${error.message}`;
});
