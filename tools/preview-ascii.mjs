// tools/preview-ascii.mjs — print Preview.png / Sample.png as an ASCII mosaic
// usage: node tools/preview-ascii.mjs [Preview.png|Sample.png] [cols=100]
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
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "PLTE") plte = data;
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
        const perByte = 8 / bitDepth;
        const byteI = Math.floor(x / perByte);
        const shift = 8 - bitDepth * (x % perByte + 1);
        idx = (cur[byteI] >> shift) & ((1 << bitDepth) - 1);
      } else idx = cur[x];
      if (colorType === 3) {
        out[(y * w + x) * 4] = plte ? plte[idx * 3] : 255;
        out[(y * w + x) * 4 + 1] = plte ? plte[idx * 3 + 1] : 255;
        out[(y * w + x) * 4 + 2] = plte ? plte[idx * 3 + 2] : 255;
        out[(y * w + x) * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        for (let c = 0; c < channels; c++) out[(y * w + x) * 4 + c] = cur[x * channels + c];
        out[(y * w + x) * 4 + 3] = colorType === 6 ? cur[x * 4 + 3] : 255;
      }
    }
    prev = cur;
  }
  return { w, h, data: out };
}

function label(r, g, b) {
  if (r > 235 && g > 235 && b > 235) return "W";
  if (r < 80 && g < 80 && b < 80) return "k";
  if (r > 200 && g > 150 && g < 215 && b > 110 && b < 200) return "s";
  if (r > 130 && g > 90 && g <= 200 && b < 130 && r >= g) return "o";
  if (r > 200 && g > 100 && g < 200 && b < 110) return "O";
  if (r > 190 && g > 160 && b < 150) return "y";
  if (g > 95 && g >= r + 8 && g >= b && r < 215) return g > 160 ? "G" : "g";
  if (b > 110 && b >= r + 30 && b >= g) return "b";
  if (Math.abs(r - g) < 32 && Math.abs(g - b) < 32 && r > 80 && r < 215) return "#";
  return "?";
}

const file = process.argv[2] || "assets/kenney-tiny-farm/Preview.png";
const cols = parseInt(process.argv[3] || "120", 10);
const img = decodePng(readFileSync(file));
const scale = Math.max(1, Math.floor(img.w / cols));
const outW = Math.floor(img.w / scale);
const outH = Math.floor(img.h / scale);
let out = `== ${file} ${img.w}x${img.h} scale ${scale} (${outW}x${outH}) ==\n`;
for (let y = 0; y < outH; y++) {
  let row = "";
  for (let x = 0; x < outW; x++) {
    const i = ((y * scale) * img.w + x * scale) * 4;
    const a = img.data[i + 3];
    row += a < 60 ? " " : label(img.data[i], img.data[i + 1], img.data[i + 2]);
  }
  out += row + "\n";
}
console.log(out);
