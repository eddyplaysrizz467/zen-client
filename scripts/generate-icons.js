/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const pngToIco = require("png-to-ico");
const { PNG } = require("pngjs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function putPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = rgba[0];
  png.data[idx + 1] = rgba[1];
  png.data[idx + 2] = rgba[2];
  png.data[idx + 3] = rgba[3];
}

function fillCircle(png, cx, cy, radius, rgba) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        putPixel(png, x, y, rgba);
      }
    }
  }
}

function fillRing(png, cx, cy, outerRadius, innerRadius, rgba) {
  const outer2 = outerRadius * outerRadius;
  const inner2 = innerRadius * innerRadius;
  for (let y = Math.floor(cy - outerRadius); y <= Math.ceil(cy + outerRadius); y++) {
    for (let x = Math.floor(cx - outerRadius); x <= Math.ceil(cx + outerRadius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= outer2 && d2 >= inner2) {
        putPixel(png, x, y, rgba);
      }
    }
  }
}

async function main() {
  const root = path.join(__dirname, "..");
  const buildDir = path.join(root, "build");
  ensureDir(buildDir);

  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const white = [244, 244, 244, 255];
  const pngPaths = [];

  for (const size of iconSizes) {
    const png = new PNG({ width: size, height: size });
    const cx = size / 2;
    const cy = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (size * y + x) << 2;
        png.data[idx] = 10;
        png.data[idx + 1] = 10;
        png.data[idx + 2] = 10;
        png.data[idx + 3] = 255;
      }
    }

    fillRing(png, cx, cy, size * 0.35, size * 0.24, white);
    fillRing(png, cx, cy, size * 0.16, size * 0.08, white);
    fillCircle(png, cx, cy, size * 0.07, white);

    const outPath = path.join(buildDir, `icon-${size}.png`);
    fs.writeFileSync(outPath, PNG.sync.write(png));
    pngPaths.push(outPath);
  }

  const pngPath = path.join(buildDir, "icon.png");
  fs.copyFileSync(path.join(buildDir, "icon-256.png"), pngPath);

  const icoPath = path.join(buildDir, "icon.ico");
  const icoBuf = await pngToIco(pngPaths);
  fs.writeFileSync(icoPath, icoBuf);

  console.log(`[icons] Wrote ${pngPath}`);
  console.log(`[icons] Wrote ${icoPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

