const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const modDir = path.join(root, "zen-client-mod");
const libsDir = path.join(modDir, "build", "libs");
const neoModDir = path.join(root, "zen-client-neoforge-mod");
const neoLibsDir = path.join(neoModDir, "build", "libs");
const bundledDir = path.join(root, "bundled-mods");
const loaderBundleDir = path.join(root, "zen-client-loader-mods");
const gradlePropsPath = path.join(modDir, "gradle.properties");
const bundleManifestPath = path.join(bundledDir, "zen-client-bundles.json");
const SUPPORTED_LOADERS = new Set(["fabric", "quilt", "forge", "neoforge"]);
const ZEN_SETTINGS_MIN_MINECRAFT_VERSION = "1.21.1";
const ZEN_SETTINGS_CURRENT_MINECRAFT_VERSION = "1.21.11";
const ZEN_SETTINGS_LEGACY_FABRIC_API_VERSION = "0.116.12+1.21.1";
const ZEN_SETTINGS_LEGACY_LOADER_VERSION = "0.16.14";

function readGradleProperty(name) {
  if (!fs.existsSync(gradlePropsPath)) return "";
  const raw = fs.readFileSync(gradlePropsPath, "utf8");
  const match = raw.match(new RegExp(`^${name}=(.+)$`, "m"));
  return match ? String(match[1]).trim() : "";
}

function runBuild(properties = {}, projectDir = modDir) {
  const command = process.platform === "win32" ? "cmd.exe" : "sh";
  const gradleCommand = process.platform === "win32" ? path.join(modDir, "gradlew.bat") : path.join(modDir, "gradlew");
  const buildArgs = [
    "clean",
    "build",
    ...Object.entries(properties).map(([name, value]) => `-P${name}=${value}`)
  ];
  const args = process.platform === "win32"
    ? ["/c", gradleCommand, "-p", projectDir, ...buildArgs]
    : [gradleCommand, "-p", projectDir, ...buildArgs];
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function pickJar(directory = libsDir) {
  const files = fs.readdirSync(directory)
    .filter((file) => file.endsWith(".jar"))
    .filter((file) => !file.endsWith("-sources.jar"))
    .filter((file) => !file.endsWith("-dev.jar"))
    .sort();

  if (!files.length) {
    throw new Error(`No built Zen Client mod jar was found in ${directory}.`);
  }

  return path.join(directory, files[0]);
}

function readJsonIfPresent(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function inferLoaderBundleSpecs() {
  if (!fs.existsSync(loaderBundleDir)) return [];

  const specs = [];
  for (const loaderEntry of fs.readdirSync(loaderBundleDir, { withFileTypes: true })) {
    if (!loaderEntry.isDirectory()) continue;
    const loader = loaderEntry.name.toLowerCase();
    if (!SUPPORTED_LOADERS.has(loader)) continue;

    const loaderDir = path.join(loaderBundleDir, loaderEntry.name);
    for (const jarEntry of fs.readdirSync(loaderDir, { withFileTypes: true })) {
      if (!jarEntry.isFile() || !jarEntry.name.toLowerCase().endsWith(".jar")) continue;

      const jarPath = path.join(loaderDir, jarEntry.name);
      const meta = readJsonIfPresent(path.join(loaderDir, `${path.basename(jarEntry.name, ".jar")}.json`));
      const version = String(meta.minecraftVersion || jarEntry.name.match(/1\.\d+(?:\.\d+)?/)?.[0] || "").trim();
      const targetName = String(meta.targetName || `zen-client-${loader}.jar`).trim();
      const outName = version ? `zen-client-${loader}-${version}.jar` : targetName;

      specs.push({
        loader,
        minecraftVersion: version,
        minecraftVersionRange: String(meta.minecraftVersionRange || "").trim(),
        file: outName,
        targetName,
        requiredMods: Array.isArray(meta.requiredMods) ? meta.requiredMods : [],
        sourcePath: jarPath,
        notes: String(meta.notes || "External loader-specific Zen mod bundle.").trim()
      });
    }
  }
  return specs;
}

fs.mkdirSync(bundledDir, { recursive: true });
const minecraftVersion = readGradleProperty("minecraft_version") || ZEN_SETTINGS_CURRENT_MINECRAFT_VERSION;
const buildTargets = [
  {
    key: "current",
    minecraftVersion,
    minecraftVersionRange: `>=${ZEN_SETTINGS_CURRENT_MINECRAFT_VERSION}`,
    properties: {}
  },
  {
    key: "legacy-1.21",
    minecraftVersion: ZEN_SETTINGS_MIN_MINECRAFT_VERSION,
    minecraftVersionRange: `>=${ZEN_SETTINGS_MIN_MINECRAFT_VERSION} <${ZEN_SETTINGS_CURRENT_MINECRAFT_VERSION}`,
    properties: {
      minecraft_version: ZEN_SETTINGS_MIN_MINECRAFT_VERSION,
      fabric_api_version: ZEN_SETTINGS_LEGACY_FABRIC_API_VERSION,
      loader_version: ZEN_SETTINGS_LEGACY_LOADER_VERSION
    }
  }
];

const builtTargets = buildTargets.map((target) => {
  runBuild(target.properties);
  const sourceJar = pickJar();
  return {
    ...target,
    sourceJar,
    sourceJarName: path.basename(sourceJar)
  };
});

runBuild({}, neoModDir);
const neoSourceJar = pickJar(neoLibsDir);
const neoTarget = {
  key: "neoforge-1.21",
  minecraftVersion: ZEN_SETTINGS_MIN_MINECRAFT_VERSION,
  minecraftVersionRange: `>=${ZEN_SETTINGS_MIN_MINECRAFT_VERSION}`,
  sourceJar: neoSourceJar,
  sourceJarName: path.basename(neoSourceJar)
};

const bundles = builtTargets.flatMap((target) => [
  {
    loader: "fabric",
    minecraftVersion: target.minecraftVersion,
    minecraftVersionRange: target.minecraftVersionRange,
    file: `zen-client-fabric-${target.minecraftVersion}.jar`,
    targetName: "zen-client-fabric.jar",
    requiredMods: ["fabric-api"],
    sourcePath: target.sourceJar
  },
  {
    loader: "quilt",
    minecraftVersion: target.minecraftVersion,
    minecraftVersionRange: target.minecraftVersionRange,
    file: `zen-client-quilt-${target.minecraftVersion}.jar`,
    targetName: "zen-client-quilt.jar",
    requiredMods: ["fabric-api"],
    notes: "Uses the Fabric-compatible Zen mod bundle on Quilt.",
    sourcePath: target.sourceJar
  }
]);

bundles.push({
  loader: "neoforge",
  minecraftVersion: neoTarget.minecraftVersion,
  minecraftVersionRange: neoTarget.minecraftVersionRange,
  file: `zen-client-neoforge-${neoTarget.minecraftVersion}.jar`,
  targetName: "zen-client-neoforge.jar",
  requiredMods: [],
  sourcePath: neoTarget.sourceJar,
  notes: "Native NeoForge Zen Client mod bundle built against Minecraft 1.21.1."
});

for (const bundle of inferLoaderBundleSpecs()) {
  const existingIndex = bundles.findIndex((item) =>
    item.loader === bundle.loader &&
    String(item.minecraftVersion || "") === String(bundle.minecraftVersion || "") &&
    String(item.targetName || "") === String(bundle.targetName || "")
  );
  if (existingIndex >= 0) bundles.splice(existingIndex, 1, bundle);
  else bundles.push(bundle);
}

for (const bundle of bundles) {
  const target = path.join(bundledDir, bundle.file);
  const bundleSource = bundle.sourcePath;
  if (!bundleSource) throw new Error(`Bundle ${bundle.file} is missing a sourcePath.`);
  fs.copyFileSync(bundleSource, target);
  console.log(`[zen-mod] bundled ${path.basename(bundleSource)} -> ${target}`);

  const unversionedTarget = path.join(bundledDir, bundle.targetName);
  fs.copyFileSync(bundleSource, unversionedTarget);
  console.log(`[zen-mod] bundled ${path.basename(bundleSource)} -> ${unversionedTarget}`);
}

fs.writeFileSync(
  bundleManifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceJars: builtTargets.map((target) => ({
        key: target.key,
        minecraftVersion: target.minecraftVersion,
        file: target.sourceJarName
      })).concat({
        key: neoTarget.key,
        minecraftVersion: neoTarget.minecraftVersion,
        file: neoTarget.sourceJarName
      }),
      bundles: bundles.map(({ sourcePath, ...bundle }) => bundle)
    },
    null,
    2
  )}\n`,
  "utf8"
);
console.log(`[zen-mod] wrote bundle manifest -> ${bundleManifestPath}`);
