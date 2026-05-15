const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const modDir = path.join(root, "zen-client-mod");
const libsDir = path.join(modDir, "build", "libs");
const bundledDir = path.join(root, "bundled-mods");
const gradlePropsPath = path.join(modDir, "gradle.properties");
const bundleManifestPath = path.join(bundledDir, "zen-client-bundles.json");

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

runBuild();
fs.mkdirSync(bundledDir, { recursive: true });
const sourceJar = pickJar();
const minecraftVersion = readGradleProperty("minecraft_version");

const bundles = [
  {
    loader: "fabric",
    minecraftVersion: minecraftVersion || "",
    file: minecraftVersion ? `zen-client-fabric-${minecraftVersion}.jar` : "zen-client-fabric.jar",
    targetName: "zen-client-fabric.jar",
    requiredMods: ["fabric-api"]
  },
  {
    loader: "quilt",
    minecraftVersion: minecraftVersion || "",
    file: minecraftVersion ? `zen-client-quilt-${minecraftVersion}.jar` : "zen-client-quilt.jar",
    targetName: "zen-client-quilt.jar",
    requiredMods: ["fabric-api"],
    notes: "Uses the Fabric-compatible Zen mod bundle on Quilt."
  }
];

for (const bundle of bundles) {
  const target = path.join(bundledDir, bundle.file);
  fs.copyFileSync(sourceJar, target);
  console.log(`[zen-mod] bundled ${path.basename(sourceJar)} -> ${target}`);

  const unversionedTarget = path.join(bundledDir, bundle.targetName);
  fs.copyFileSync(sourceJar, unversionedTarget);
  console.log(`[zen-mod] bundled ${path.basename(sourceJar)} -> ${unversionedTarget}`);
}

fs.writeFileSync(
  bundleManifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceJar: path.basename(sourceJar),
      bundles
    },
    null,
    2
  )}\n`,
  "utf8"
);
console.log(`[zen-mod] wrote bundle manifest -> ${bundleManifestPath}`);
