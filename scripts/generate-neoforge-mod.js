const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fabricSourceDir = path.join(root, "zen-client-mod", "src", "main", "java", "com", "eddyplaysrizz467", "zenclientmod");
const neoGeneratedDir = path.join(root, "zen-client-neoforge-mod", "src", "generated", "java", "com", "eddyplaysrizz467", "zenclientmod");

const fabricMainPath = path.join(fabricSourceDir, "ZenClientMod.java");
const neoMainPath = path.join(neoGeneratedDir, "ZenClientMod.java");
const fabricMixinPath = path.join(fabricSourceDir, "mixin", "ClientBrandRetrieverMixin.java");
const neoMixinPath = path.join(neoGeneratedDir, "mixin", "ClientBrandRetrieverMixin.java");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copySharedSources(sourceDir, targetDir, prefix = "") {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      ensureDir(targetPath);
      copySharedSources(sourcePath, targetPath, relativePath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".java")) continue;
    if (relativePath === "ZenClientMod.java") continue;
    if (relativePath === path.join("mixin", "ClientBrandRetrieverMixin.java")) continue;
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function replaceBetween(source, startNeedle, endNeedle, replacement) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start < 0 || end < 0) {
    throw new Error(`Could not generate NeoForge source; missing ${startNeedle} or ${endNeedle}.`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

function generateMainClass() {
  let source = fs.readFileSync(fabricMainPath, "utf8").replace(/\r\n/g, "\n");

  source = source.replace(/import net\.fabricmc[^\n]+\r?\n/g, "");
  source = source.replace(
    "import net.minecraft.client.Minecraft;\n",
    [
      "import net.neoforged.api.distmarker.Dist;",
      "import net.neoforged.fml.common.Mod;",
      "import net.neoforged.fml.loading.FMLEnvironment;",
      "import net.neoforged.neoforge.client.event.ClientChatEvent;",
      "import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;",
      "import net.neoforged.neoforge.client.event.ClientTickEvent;",
      "import net.neoforged.neoforge.client.event.RenderGuiEvent;",
      "import net.neoforged.neoforge.client.event.ScreenEvent;",
      "import net.neoforged.neoforge.common.NeoForge;",
      "import net.minecraft.client.Minecraft;"
    ].join("\n") + "\n"
  );

  source = source.replace(
    "public final class ZenClientMod implements ClientModInitializer {",
    "@Mod(ZenClientMod.MOD_ID)\npublic final class ZenClientMod {\n  public static final String MOD_ID = \"zen_client_mod\";"
  );

  const neoInitializer = `  public ZenClientMod() {
    if (FMLEnvironment.dist != Dist.CLIENT) return;
    INSTANCE = this;
    CONFIG = ZenConfig.load();

    NeoForge.EVENT_BUS.addListener(this::onScreenInit);
    NeoForge.EVENT_BUS.addListener(this::onEndClientTick);
    NeoForge.EVENT_BUS.addListener(this::onClientChat);
    NeoForge.EVENT_BUS.addListener(this::onClientDisconnect);
    NeoForge.EVENT_BUS.addListener(this::onRenderGui);
  }

  private void onScreenInit(ScreenEvent.Init.Post event) {
    Screen screen = event.getScreen();
    if (!(screen instanceof PauseScreen)) return;
    Minecraft client = Minecraft.getInstance();
    event.addListener(
      Button.builder(Component.literal("Zen Client Settings"), button -> client.setScreen(new ZenSettingsScreen(screen)))
        .bounds(6, 6, 150, 20)
        .build()
    );
    event.addListener(
      Button.builder(Component.literal("Host Zen LAN"), button -> hostZenLan(client))
        .bounds(6, 30, 150, 20)
        .build()
    );
    event.addListener(
      Button.builder(Component.literal("Zen Friends"), button -> client.setScreen(new ZenFriendsScreen(screen)))
        .bounds(6, 54, 150, 20)
        .build()
    );
  }

  private void onEndClientTick(ClientTickEvent.Post event) {
    onEndTick(Minecraft.getInstance());
  }

  private void onClientChat(ClientChatEvent event) {
    String command = event.getMessage() == null ? "" : event.getMessage().trim();
    if (!command.equalsIgnoreCase("restart") && !command.equalsIgnoreCase("/restart")) return;
    requestManagedServerRestart(Minecraft.getInstance());
    event.setCanceled(true);
  }

  private void onClientDisconnect(ClientPlayerNetworkEvent.LoggingOut event) {
    resetSession();
  }

  private void onRenderGui(RenderGuiEvent.Post event) {
    renderHud(Minecraft.getInstance(), event.getGuiGraphics());
  }
`;

  source = replaceBetween(source, "  @Override\n  public void onInitializeClient() {", "\n\n  private void hostZenLan", neoInitializer);
  ensureDir(path.dirname(neoMainPath));
  fs.writeFileSync(neoMainPath, source, "utf8");
}

function generateMixinClass() {
  let source = fs.readFileSync(fabricMixinPath, "utf8").replace(/\r\n/g, "\n");
  source = source.replace("Zen Client - Fabric", "Zen Client - NeoForge");
  ensureDir(path.dirname(neoMixinPath));
  fs.writeFileSync(neoMixinPath, source, "utf8");
}

fs.rmSync(neoGeneratedDir, { recursive: true, force: true });
ensureDir(neoGeneratedDir);
copySharedSources(fabricSourceDir, neoGeneratedDir);
generateMainClass();
generateMixinClass();
console.log(`[zen-mod] generated NeoForge sources -> ${path.dirname(neoMainPath)}`);
