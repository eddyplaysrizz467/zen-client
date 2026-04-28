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
let updateStatus = null;
let skinRenderNonce = 0;
const installedLibraryItems = new Set();
let installedLibraryScan = { mods: [], resourcepacks: [] };
let bootFinished = false;
let loadingFinished = false;
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
    installMenuPackButton,
    refreshSkinButton,
    uploadSkinButton,
    openModsFolderButton,
    openPacksFolderButton,
    refreshModsButton,
    refreshPacksButton
  ].forEach((button) => {
    button.disabled = nextBusy;
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

function createBambooStalk(id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bamboo-stalk";
  button.dataset.id = String(id);
  button.style.left = `${randomBetween(8, 88)}%`;
  button.style.height = `${Math.round(randomBetween(180, 260))}px`;
  button.style.opacity = String(randomBetween(0.76, 0.98));
  button.innerHTML = `
    <span class="bamboo-leaf leaf-left"></span>
    <span class="bamboo-leaf leaf-right"></span>
  `;

  button.addEventListener("click", () => breakBamboo(button));
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

async function breakBamboo(button) {
  if (!button || button.classList.contains("breaking")) return;

  const angleClass = Math.random() < 0.5 ? "angle-a" : "angle-b";
  const fallAngle = angleClass === "angle-a" ? "45deg" : "125deg";
  const rect = button.getBoundingClientRect();
  button.classList.add("breaking", angleClass);
  button.style.setProperty("--fall-angle", fallAngle);
  spawnBambooParticles(rect.left + rect.width / 2, rect.top + rect.height / 3);

  await delay(700);
  button.classList.add("falling-out");

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
    updateNoticeButton.textContent = "Yes";
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
    panel.setAttribute("aria-hidden", active ? "false" : "true");
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

minecraftDirectory.addEventListener("change", () => {
  if (localStorage.getItem("aeroTab") === "library") {
    ensureLibraryLoaded().catch(() => {});
  }
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
  const root = String(collectSettings().minecraftDirectory || "").trim().toLowerCase();
  const id = String(item?.project_id || item?.slug || item?.title || "").trim().toLowerCase();
  return `${projectType}:${root}:${id}`;
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
  installedLibraryScan = await window.aeroApi.scanInstalledLibrary({
    minecraftDirectory: collectSettings().minecraftDirectory
  });
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
        minecraftDirectory: settings.minecraftDirectory,
        minecraftVersion: settings.minecraftVersion,
        launchType: settings.launchType
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
    await refreshInstalledLibraryScan();
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

openModsFolderButton.addEventListener("click", async () => {
  const settings = collectSettings();
  try {
    const result = await window.aeroApi.openFolder({
      minecraftDirectory: settings.minecraftDirectory,
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
      minecraftDirectory: settings.minecraftDirectory,
      kind: "resourcepacks"
    });
    statusText.textContent = `Opened resource packs folder: ${result.path}`;
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  }
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
  setActiveTab(localStorage.getItem("aeroTab") || "launcher");
  await refreshVersions();
  if (localStorage.getItem("aeroTab") === "skins") renderSkinHead();
  bootFinished = true;
  maybeFinishLoading();
}

boot().catch((error) => {
  statusText.textContent = `Problem: ${error.message}`;
});
