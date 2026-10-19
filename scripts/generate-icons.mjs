/**
 * Generates the PWA icons (192x192 and 512x512 PNG) with zero dependencies.
 *
 * Design: tangerine-orange rounded square with a white "convert" symbol —
 * two opposing horizontal arrows (right on top, left below).
 * Pure Node: pixels are computed here and encoded as PNG with built-in zlib.
 *
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORANGE_TOP = [247, 133, 32]; // close to #F2760A at the top
const ORANGE_BOT = [214, 96, 4]; // #D66004 at the bottom
const WHITE = [255, 255, 255];

/* ---------------- CRC32 (needed for PNG chunks) ---------------- */
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y += 1) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- drawing ---------------- */
// Is point (x,y) inside arrow (shaft + triangular head)?
// Arrow occupies y in [cy-half, cy+half] for the shaft, head is a triangle.
function inArrow(x, y, size, cy, pointingRight) {
  const shaftHalf = size * 0.045;
  const headHalf = size * 0.105;
  const x0 = size * 0.24; // tail
  const x1 = size * 0.76; // tip
  const headStart = size * 0.60;
  const dy = Math.abs(y - cy);
  if (pointingRight) {
    if (x >= x0 && x <= headStart && dy <= shaftHalf) return true;
    if (x > headStart && x <= x1) {
      const t = (x - headStart) / (x1 - headStart);
      if (dy <= headHalf * (1 - t)) return true;
    }
  } else {
    const mx = size - x; // mirror
    if (mx >= x0 && mx <= headStart && dy <= shaftHalf) return true;
    if (mx > headStart && mx <= x1) {
      const t = (mx - headStart) / (x1 - headStart);
      if (dy <= headHalf * (1 - t)) return true;
    }
  }
  return false;
}

function pixelAtFactory(size) {
  const radius = size * 0.22;
  return (x, y) => {
    // rounded-rect alpha mask
    const dx = Math.max(radius - x, x - (size - radius), 0);
    const dy = Math.max(radius - y, y - (size - radius), 0);
    const cornered = (x < radius || x >= size - radius) && (y < radius || y >= size - radius);
    if (cornered && dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
    if (inArrow(x, y, size, size * 0.38, true) || inArrow(x, y, size, size * 0.62, false)) {
      return [...WHITE, 255];
    }
    const t = y / size;
    return [
      Math.round(ORANGE_TOP[0] + (ORANGE_BOT[0] - ORANGE_TOP[0]) * t),
      Math.round(ORANGE_TOP[1] + (ORANGE_BOT[1] - ORANGE_TOP[1]) * t),
      Math.round(ORANGE_TOP[2] + (ORANGE_BOT[2] - ORANGE_TOP[2]) * t),
      255,
    ];
  };
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), encodePng(size, pixelAtFactory(size)));
  console.log(`wrote icon-${size}.png`);
}
