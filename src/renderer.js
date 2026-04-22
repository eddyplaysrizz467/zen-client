const accountsList = document.getElementById("accountsList");
const heroHelp = document.getElementById("heroHelp");
const statusText = document.getElementById("statusText");
const progressText = document.getElementById("progressText");
const logBox = document.getElementById("logBox");

const tabLauncher = document.getElementById("tabLauncher");
const tabSettings = document.getElementById("tabSettings");
const tabSkins = document.getElementById("tabSkins");
const panelLauncher = document.getElementById("panelLauncher");
const panelSettings = document.getElementById("panelSettings");
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
const skinFile = document.getElementById("skinFile");
const uploadClassicSkin = document.getElementById("uploadClassicSkin");
const uploadSlimSkin = document.getElementById("uploadSlimSkin");
const refreshSkinButton = document.getElementById("refreshSkinButton");

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

function setBusy(nextBusy) {
  busy = nextBusy;
  [
    microsoftButton,
    removeAccountButton,
    offlineButton,
    refreshVersionsButton,
    launchButton,
    installMenuPackButton,
    uploadClassicSkin,
    uploadSlimSkin,
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
  backgroundPreset.value = state.settings.backgroundPreset || "coral";
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

function applyBackgroundPreset(presetValue) {
  const preset = String(presetValue || "coral").toLowerCase();
  document.documentElement.dataset.preset = preset;
}

function appendLog(message) {
  logBox.textContent = `${logBox.textContent}${message}\n`;
  logBox.scrollTop = logBox.scrollHeight;
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
    { name: "skins", button: tabSkins, panel: panelSkins }
  ];
  tabs.forEach(({ name, button, panel }) => {
    const active = name === tabName;
    button.classList.toggle("active", active);
    panel.classList.toggle("active", active);
  });
  localStorage.setItem("aeroTab", tabName);
  if (tabName === "skins") {
    refreshSkinProfile().catch(() => {});
  }
}

tabLauncher.addEventListener("click", () => setActiveTab("launcher"));
tabSettings.addEventListener("click", () => setActiveTab("settings"));
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
    if (localStorage.getItem("aeroTab") === "skins") {
      await refreshSkinProfile();
    }
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

async function refreshSkinProfile() {
  const selected = getSelectedAccount();
  if (!selected || selected.type !== "microsoft") {
    skinPreviewBox.innerHTML = `<div class="empty-state">Select a Microsoft account to load skin info.</div>`;
    uploadClassicSkin.disabled = true;
    uploadSlimSkin.disabled = true;
    refreshSkinButton.disabled = true;
    return;
  }
  uploadClassicSkin.disabled = busy;
  uploadSlimSkin.disabled = busy;
  refreshSkinButton.disabled = busy;
  skinPreviewBox.innerHTML = `<div class="empty-state">Loading skin profile...</div>`;
  try {
    const profile = await window.aeroApi.getSkinProfile();
    const skins = Array.isArray(profile?.skins) ? profile.skins : [];
    const current = skins.find((skin) => skin.state === "ACTIVE") || skins[0];
    if (!current?.url) {
      skinPreviewBox.innerHTML = `<div class="empty-state">No skin URL returned by Minecraft services.</div>`;
      return;
    }
    // Minecraft sometimes returns `http://textures.minecraft.net/...`. Use https to avoid mixed-content/security issues.
    const safeUrl = String(current.url).replace(/^http:\/\//i, "https://");
    skinPreviewBox.innerHTML = `<img alt="Minecraft skin preview" referrerpolicy="no-referrer" src="${safeUrl}" />`;
  } catch (error) {
    skinPreviewBox.innerHTML = `<div class="empty-state">Problem loading skin: ${error.message}</div>`;
  }
}

async function uploadSkin(variant) {
  const selected = getSelectedAccount();
  if (!selected || selected.type !== "microsoft") {
    statusText.textContent = "Select a Microsoft account to upload a skin.";
    return;
  }
  if (!skinFile.files || !skinFile.files.length) {
    statusText.textContent = "Choose a skin PNG file first.";
    return;
  }
  const file = skinFile.files[0];
  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));
  setBusy(true);
  uploadClassicSkin.disabled = true;
  uploadSlimSkin.disabled = true;
  refreshSkinButton.disabled = true;
  statusText.textContent = "Uploading skin...";
  try {
    await window.aeroApi.uploadSkin({ variant, bytes });
    statusText.textContent = "Skin uploaded. Refreshing preview...";
    await refreshSkinProfile();
    statusText.textContent = "Skin updated.";
  } catch (error) {
    statusText.textContent = `Problem: ${error.message}`;
  } finally {
    setBusy(false);
    uploadClassicSkin.disabled = !isMicrosoftSelected();
    uploadSlimSkin.disabled = !isMicrosoftSelected();
    refreshSkinButton.disabled = !isMicrosoftSelected();
  }
}

uploadClassicSkin.addEventListener("click", () => uploadSkin("classic"));
uploadSlimSkin.addEventListener("click", () => uploadSkin("slim"));
refreshSkinButton.addEventListener("click", () => refreshSkinProfile());

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
  if (stored === "skins") {
    refreshSkinProfile().catch(() => {});
  }
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
  uploadClassicSkin.disabled = !isMicrosoftSelected();
  uploadSlimSkin.disabled = !isMicrosoftSelected();
  refreshSkinButton.disabled = !isMicrosoftSelected();
}

boot().catch((error) => {
  statusText.textContent = `Problem: ${error.message}`;
});
