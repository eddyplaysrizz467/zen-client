const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const modDir = path.join(root, "zen-client-mod");
const libsDir = path.join(modDir, "build", "libs");
const bundledDir = path.join(root, "bundled-mods");
const bundledJar = path.join(bundledDir, "zen-client-fabric.jar");
const gradlePropsPath = path.join(modDir, "gradle.properties");

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
fs.copyFileSync(sourceJar, bundledJar);
const minecraftVersion = readGradleProperty("minecraft_version");
if (minecraftVersion) {
  const versionedJar = path.join(bundledDir, `zen-client-fabric-${minecraftVersion}.jar`);
  fs.copyFileSync(sourceJar, versionedJar);
  console.log(`[zen-mod] bundled ${path.basename(sourceJar)} -> ${versionedJar}`);
}
console.log(`[zen-mod] bundled ${path.basename(sourceJar)} -> ${bundledJar}`);
