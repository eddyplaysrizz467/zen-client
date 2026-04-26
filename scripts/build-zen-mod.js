const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const modDir = path.join(root, "zen-client-mod");
const libsDir = path.join(modDir, "build", "libs");
const bundledDir = path.join(root, "bundled-mods");
const bundledJar = path.join(bundledDir, "zen-client-fabric.jar");

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
console.log(`[zen-mod] bundled ${path.basename(sourceJar)} -> ${bundledJar}`);
