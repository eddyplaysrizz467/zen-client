/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const pngToIco = require("png-to-ico");
const { PNG } = require("pngjs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function drawCircle(png, cx, cy, radius, thickness, rgba) {
  const r2Outer = radius * radius;
  const r2Inner = Math.max(0, radius - thickness) ** 2;
  const { width, height } = png;
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2Outer && d2 >= r2Inner) {
        const idx = (width * y + x) << 2;
        png.data[idx] = rgba[0];
        png.data[idx + 1] = rgba[1];
        png.data[idx + 2] = rgba[2];
        png.data[idx + 3] = rgba[3];
      }
    }
  }
}

async function main() {
  const root = path.join(__dirname, "..");
  const buildDir = path.join(root, "build");
  ensureDir(buildDir);

  const size = 256;
  const png = new PNG({ width: size, height: size });

  // Background: near-black.
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 10;
    png.data[i + 1] = 10;
    png.data[i + 2] = 10;
    png.data[i + 3] = 255;
  }

  const white = [245, 245, 245, 255];
  const cx = size / 2;
  const cy = size / 2;

  // Two rings + center dot.
  drawCircle(png, cx, cy, 96, 18, white);
  drawCircle(png, cx, cy, 52, 18, white);
  drawCircle(png, cx, cy, 16, 16, white);

  const pngPath = path.join(buildDir, "icon.png");
  fs.writeFileSync(pngPath, PNG.sync.write(png));

  const icoPath = path.join(buildDir, "icon.ico");
  const icoBuf = await pngToIco([pngPath]);
  fs.writeFileSync(icoPath, icoBuf);

  console.log(`[icons] Wrote ${pngPath}`);
  console.log(`[icons] Wrote ${icoPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

