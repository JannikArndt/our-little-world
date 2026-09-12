// The icon on somebody's Home Screen, drawn the way the game draws everything
// else: in code, from the same handful of colours. No image was downloaded to
// make this, and none has to be edited to change it.
//
//   node tools/icons.mjs        writes icons/app-<size>.png
//
// Run it when the picture changes. The PNGs are committed, because a browser
// asking for an icon cannot wait for a build step.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SIZES = [180, 192, 512]; // Home Screen, and the two a manifest asks for
const SS = 4; // drawn this much bigger, then averaged down

const C = {
  sky: [246, 239, 226],
  skyLow: [236, 224, 203],
  sun: [242, 193, 78],
  sunGlow: [247, 221, 148],
  grass: [142, 201, 111],
  grassLo: [124, 184, 95],
  water: [105, 173, 205],
  waterLo: [77, 143, 178],
  wall: [242, 228, 203],
  roof: [196, 105, 75],
  roofLo: [165, 83, 58],
  wood: [138, 92, 48],
};

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const hillAt = u => 0.475 + 0.035 * Math.sin(u * 3.4 + 0.6);
const riverAt = v => 0.3 + 0.09 * Math.sin(v * 3.1 + 1.2);

/** One pixel of the picture, in normalised coordinates. */
function colourAt(u, v) {
  const hill = hillAt(u);

  // the sun, with a soft halo, sitting in the sky
  const sd = Math.hypot(u - 0.76, v - 0.185);

  if (v < hill) {
    let c = mix(C.sky, C.skyLow, Math.min(1, v / hill));
    if (sd < 0.115) return C.sun;
    if (sd < 0.185) return mix(c, C.sunGlow, ((0.185 - sd) / 0.07) * 0.55);
    return c;
  }

  // the ground, greener as it comes towards you
  let c = mix(C.grass, C.grassLo, Math.min(1, ((v - hill) / (1 - hill)) * 1.4));

  // a river running down through it
  const rx = riverAt(v),
    half = 0.055 + 0.03 * (v - hill);
  const d = Math.abs(u - rx);
  if (d < half) c = mix(C.water, C.waterLo, Math.min(1, v - hill));
  else if (d < half + 0.018) c = mix(c, C.waterLo, 0.35);

  // and a house standing on it, because that is what the game is about
  const hx = 0.625,
    hy = 0.655,
    hw = 0.3,
    hh = 0.235;
  if (u > hx - hw / 2 && u < hx + hw / 2 && v > hy && v < hy + hh) {
    const shade = u > hx + hw / 6 ? 0.18 : 0;
    if (Math.abs(u - hx) < 0.048 && v > hy + hh * 0.38) return mix(C.wood, [0, 0, 0], 0.05);
    return mix(C.wall, C.roofLo, shade * 0.35);
  }
  // the roof: a triangle sitting on the walls
  const rTop = hy - 0.135,
    rW = hw / 2 + 0.045;
  if (v >= rTop && v <= hy) {
    const t = (v - rTop) / (hy - rTop);
    if (Math.abs(u - hx) < rW * t) return u > hx ? C.roofLo : C.roof;
  }
  // a tree on the near bank, so the forest is in the picture too
  const tx = 0.175,
    ty = 0.7;
  if (Math.abs(u - tx) < 0.022 && v > ty && v < ty + 0.135) return C.wood;
  const td = Math.hypot((u - tx) * 1.05, (v - (ty - 0.045)) * 1.25);
  if (td < 0.105) return td > 0.075 && u > tx ? [95, 154, 77] : [110, 167, 90];

  return c;
}

/* ---- turning that into a PNG, by hand ---- */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  // draw it big, then average each block down — cheap, honest antialiasing
  const big = size * SS;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const line = y * (size * 4 + 1);
    raw[line] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt((x * SS + sx + 0.5) / big, (y * SS + sy + 0.5) / big);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      const n = SS * SS,
        at = line + 1 + x * 4;
      raw[at] = Math.round(r / n);
      raw[at + 1] = Math.round(g / n);
      raw[at + 2] = Math.round(b / n);
      raw[at + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = process.argv[2] || join(ROOT, 'icons');
mkdirSync(out, { recursive: true });
for (const size of SIZES) {
  const file = join(out, 'app-' + size + '.png');
  writeFileSync(file, png(size));
  console.log('wrote ' + file);
}
