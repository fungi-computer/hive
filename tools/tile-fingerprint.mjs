// tools/tile-fingerprint.mjs — decode Kenney Tiny Farm tiles (pure Node, zlib built-in)
// and print dominant color clusters + an ASCII sketch so we can identify which tile
// is which sprite WITHOUT a browser.
// Usage: node tools/tile-fingerprint.mjs            → all 132 tiles, cluster summary
//        node tools/tile-fingerprint.mjs 3,4,5 -f   → full 16x16 ASCII for those tiles
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const cur = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    if (f === 1) for (let i = channels; i < stride; i++) cur[i] = (cur[i] + cur[i - channels]) & 0xff;
    else if (f === 2) for (let i = 0; i < stride; i++) cur[i] = (cur[i] + prev[i]) & 0xff;
    else if (f === 3) for (let i = 0; i < stride; i++) { const a = i >= channels ? cur[i - channels] : 0; cur[i] = (cur[i] + ((a + prev[i]) >> 1)) & 0xff; }
    else if (f === 4) for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
    }
    for (let x = 0; x < w; x++) {
      let idx;
      if (colorType === 3 && bitDepth < 8) {
        // packed sub-byte indices (bitDepth 4 → 2 px/byte, 2 → 4 px/byte)
        const bits = bitDepth;
        const perByte = 8 / bits;
        const byteI = Math.floor(x / perByte);
        const shift = 8 - bits * (x % perByte + 1);
        idx = (cur[byteI] >> shift) & ((1 << bits) - 1);
      } else {
        idx = cur[x];
      }
      if (colorType === 3) {
        // palette index → RGBA via PLTE + tRNS
        const r = plte ? plte[idx * 3] : 255;
        const g = plte ? plte[idx * 3 + 1] : 255;
        const b = plte ? plte[idx * 3 + 2] : 255;
        const a = trns && idx < trns.length ? trns[idx] : 255;
        out[(y * w + x) * 4] = r;
        out[(y * w + x) * 4 + 1] = g;
        out[(y * w + x) * 4 + 2] = b;
        out[(y * w + x) * 4 + 3] = a;
      } else {
        for (let c = 0; c < channels; c++) out[(y * w + x) * 4 + c] = cur[x * channels + c];
        out[(y * w + x) * 4 + 3] = colorType === 6 ? cur[x * 4 + 3] : 255;
      }
    }
    prev = cur;
  }
  return { w, h, data: out };
}

const hex = (v) => "#" + v.map((x) => x.toString(16).padStart(2, "0")).join("");
const dir = "assets/kenney-tiny-farm/Tiles";

// clusters: quantize opaque pixels to 5-bit buckets so identical colors merge
function clusters(img) {
  const m = new Map();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const a = img.data[i + 3];
    if (a < 40) continue;
    const key = [img.data[i] >> 3, img.data[i + 1] >> 3, img.data[i + 2] >> 3].join(",");
    m.set(key, (m.get(key) || 0) + 1);
  }
  return [...m.entries()]
    .map(([k, n]) => ({ rgb: k.split(",").map((x) => +x * 8 + 4), n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
}

// crude perceptual label for the ASCII sketch
function label(r, g, b) {
  if (r > 225 && g > 225 && b > 225) return "W";
  if (r < 70 && g < 70 && b < 70) return "k";
  if (r > 200 && g > 150 && g < 215 && b > 110 && b < 195) return "S"; // skin
  if (r > 170 && g < 110 && b < 110) return "R";
  if (r > 200 && g > 110 && g < 200 && b < 120) return "O";
  if (r > 190 && g > 170 && b < 140) return "Y";
  if (g > 110 && g >= r && g >= b && r < 170) return g > 170 ? "G" : "g";
  if (r > 90 && r < 190 && g > 60 && g < 150 && b < 110 && r >= g) return "B";
  if (g > r + 20 && b > r + 20 && b > 90) return "b"; // blue-ish
  if (Math.abs(r - g) < 22 && Math.abs(g - b) < 22 && r > 70 && r < 210) return "#"; // gray
  return "?";
}

const full = process.argv.includes("-f");
const arg = process.argv[2];
const indices = arg && !arg.startsWith("-") ? arg.split(",").map(Number) : Array.from({ length: 132 }, (_, i) => i);
let report = "";
for (const ti of indices) {
  const f = `tile_${String(ti).padStart(4, "0")}.png`;
  let img;
  try { img = decodePng(readFileSync(`${dir}/${f}`)); }
  catch (e) { report += `${ti}: ERR\n`; continue; }
  const cls = clusters(img);
  const summary = cls.map((c) => `${hex(c.rgb)}×${c.n}`).join(" ");
  report += `tile ${String(ti).padStart(4, "0")}  ${summary}\n`;
  if (full) {
    for (let y = 0; y < 16; y++) {
      let row = "";
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const a = img.data[i + 3];
        row += a < 40 ? "." : label(img.data[i], img.data[i + 1], img.data[i + 2]);
      }
      report += "  " + row + "\n";
    }
  }
}
console.log(report);
