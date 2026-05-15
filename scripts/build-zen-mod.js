const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const modDir = path.join(root, "zen-client-mod");
const libsDir = path.join(modDir, "build", "libs");
const bundledDir = path.join(root, "bundled-mods");
const loaderBundleDir = path.join(root, "zen-client-loader-mods");
const gradlePropsPath = path.join(modDir, "gradle.properties");
const bundleManifestPath = path.join(bundledDir, "zen-client-bundles.json");
const SUPPORTED_LOADERS = new Set(["fabric", "quilt", "forge", "neoforge"]);

function readGradleProperty(name) {
  if (!fs.existsSync(gradlePropsPath)) return "";
  const raw = fs.readFileSync(gradlePropsPath, "utf8");
  const match = raw.match(new RegExp(`^${name}=(.+)$`, "m"));
  return match ? String(match[1]).trim() : "";
}

function runBuild() {
  const command = process.platform === "win32" ? "cmd.exe" : "sh";
  const args = process.platform === "win32" ? ["/c", "gradlew.bat", "build"] : ["./gradlew", "build"];
  const result = spawnSync(command, args, {
    cwd: modDir,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function pickJar() {
  const files = fs.readdirSync(libsDir)
    .filter((file) => file.endsWith(".jar"))
    .filter((file) => !file.endsWith("-sources.jar"))
    .filter((file) => !file.endsWith("-dev.jar"))
    .sort();

  if (!files.length) {
    throw new Error("No built Zen Client mod jar was found.");
  }

  return path.join(libsDir, files[0]);
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

runBuild();
fs.mkdirSync(bundledDir, { recursive: true });
const sourceJar = pickJar();
const minecraftVersion = readGradleProperty("minecraft_version");

const bundles = [
  {
    loader: "fabric",
    minecraftVersion: minecraftVersion || "",
    minecraftVersionRange: ">=1.21",
    file: minecraftVersion ? `zen-client-fabric-${minecraftVersion}.jar` : "zen-client-fabric.jar",
    targetName: "zen-client-fabric.jar",
    requiredMods: ["fabric-api"]
  },
  {
    loader: "quilt",
    minecraftVersion: minecraftVersion || "",
    minecraftVersionRange: ">=1.21",
    file: minecraftVersion ? `zen-client-quilt-${minecraftVersion}.jar` : "zen-client-quilt.jar",
    targetName: "zen-client-quilt.jar",
    requiredMods: ["fabric-api"],
    notes: "Uses the Fabric-compatible Zen mod bundle on Quilt."
  }
];

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
  const bundleSource = bundle.sourcePath || sourceJar;
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
      sourceJar: path.basename(sourceJar),
      bundles: bundles.map(({ sourcePath, ...bundle }) => bundle)
    },
    null,
    2
  )}\n`,
  "utf8"
);
console.log(`[zen-mod] wrote bundle manifest -> ${bundleManifestPath}`);
