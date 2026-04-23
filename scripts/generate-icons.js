/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const pngToIco = require("png-to-ico");
const { PNG } = require("pngjs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function putPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = rgba[0];
  png.data[idx + 1] = rgba[1];
  png.data[idx + 2] = rgba[2];
  png.data[idx + 3] = rgba[3];
}

function drawSoftDot(png, x, y, radius, rgba) {
  const r = Math.max(1, radius);
  const r2 = r * r;
  for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
    for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
      const dx = xx - x;
      const dy = yy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const falloff = 1 - d2 / r2;
      const a = Math.max(0, Math.min(255, Math.round(rgba[3] * falloff)));
      putPixel(png, xx, yy, [rgba[0], rgba[1], rgba[2], a]);
    }
  }
}

function drawEnso(png, cx, cy, baseRadius, seed) {
  const rng = mulberry32(seed);
  const white = [245, 245, 245, 235];
  const start = 0.1 * Math.PI;
  const end = 1.84 * Math.PI;
  const steps = 1200;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + (end - start) * t;
    const wobble = (rng() - 0.5) * 4.4 + Math.sin(a * 3.2) * 1.8;
    const radius = baseRadius + wobble;
    const thick = 12.5 + (rng() - 0.5) * 6.5 + (1 - t) * 2.1;
    const dotR = Math.max(2.2, thick / 3.1);
    const alpha = Math.round(170 + rng() * 70);
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;

    drawSoftDot(png, x, y, dotR, [white[0], white[1], white[2], alpha]);
    if (i % 11 === 0) {
      const fx = x + (rng() - 0.5) * 2.2;
      const fy = y + (rng() - 0.5) * 2.2;
      drawSoftDot(png, fx, fy, dotR * 0.8, [white[0], white[1], white[2], Math.round(alpha * 0.35)]);
    }
  }

  for (let i = 0; i < png.data.length; i += 4) {
    const grain = (rng() - 0.5) * 12;
    png.data[i] = Math.max(0, Math.min(255, png.data[i] + grain));
    png.data[i + 1] = Math.max(0, Math.min(255, png.data[i + 1] + grain));
    png.data[i + 2] = Math.max(0, Math.min(255, png.data[i + 2] + grain));
  }
}

async function main() {
  const root = path.join(__dirname, "..");
  const buildDir = path.join(root, "build");
  ensureDir(buildDir);

  const size = 256;
  const png = new PNG({ width: size, height: size });

  // Background: charcoal with a slight vignette.
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const vignette = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const base = 14 - Math.round(vignette * 6);
      const idx = (size * y + x) << 2;
      png.data[idx] = base;
      png.data[idx + 1] = base;
      png.data[idx + 2] = base;
      png.data[idx + 3] = 255;
    }
  }

  drawEnso(png, cx, cy, 88, 1337);

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

