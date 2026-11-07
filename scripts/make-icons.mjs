// Generates the app icons as PNGs using only Node's built-in zlib.
// Design: red rounded square, three white bars like the dashboard chart
// (two soft, the last solid with a dot on top).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'icons');
fs.mkdirSync(outDir, { recursive: true });

const RED = [0xe1, 0x1d, 0x2e];
const WHITE = [255, 255, 255];

function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** Colour of one sample point in unit space, as [r,g,b,a] (a 0..1). */
function sample(u, v, { maskable, rounded }) {
  const bgR = rounded ? 0.225 : 0;
  if (!inRoundRect(u, v, 0, 0, 1, 1, bgR)) return [0, 0, 0, 0];
  let c = [...RED, 1];
  // Content shrinks into the maskable safe zone (inner 80% circle).
  const s = maskable ? 0.74 : 1;
  const tu = 0.5 + (u - 0.5) / s;
  const tv = 0.5 + (v - 0.5) / s;
  const bw = 0.15;
  const bottom = 0.79;
  const bars = [
    { x: 0.2, h: 0.3, a: 0.55 },
    { x: 0.425, h: 0.44, a: 0.55 },
    { x: 0.65, h: 0.5, a: 1 },
  ];
  for (const b of bars) {
    if (inRoundRect(tu, tv, b.x, bottom - b.h, bw, b.h, bw / 2)) {
      c = [0, 1, 2].map((i) => Math.round(c[i] * (1 - b.a) + WHITE[i] * b.a)).concat(1);
    }
  }
  const top = bars[2];
  const dx = tu - (top.x + bw / 2);
  const dy = tv - (bottom - top.h - 0.09);
  if (dx * dx + dy * dy <= 0.04 ** 2) c = [...WHITE, 1];
  return c;
}

function render(size, opts) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, opts);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (y * size + x) * 4;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return encodePNG(size, size, buf);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192, { rounded: true }],
  ['icon-512.png', 512, { rounded: true }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
];
for (const [name, size, opts] of targets) {
  fs.writeFileSync(path.join(outDir, name), render(size, opts));
  console.log(`icons/${name} (${size}x${size})`);
}
