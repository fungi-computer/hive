// tools/sheet-view.mjs — print the full 12x11 tile sheet as an ASCII map (8x8 per tile)
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

function label(r, g, b, a) {
  if (a < 40) return ".";
  if (r > 22 && g > 22 && b > 22 && Math.abs(r-g) < 9 && Math.abs(g-b) < 9) return "k"; // outline dark
  if (r > 245 && g > 245 && b > 245) return "W";
  if (r > 200 && g > 150 && g < 215 && b > 110 && b < 195) return "s"; // skin
  if (r > 130 && g > 100 && g < 200 && b < 130 && r >= g) return "o"; // orange/tan/wood
  if (r > 200 && g > 100 && g < 200 && b < 100) return "O";
  if (r > 190 && g > 170 && b < 150) return "y";
  if (g > 100 && g >= r + 10 && g >= b && r < 210) return g > 170 ? "G" : "g";
  if (b > 130 && b >= r + 40 && b >= g) return "b";
  if (r < 115 && g < 115 && b < 115) return "k";
  if (Math.abs(r-g) < 30 && Math.abs(g-b) < 30 && r > 115 && r < 215) return "#";
  if (r > 215 && g > 215 && b > 215) return "W";
  return "?";
}

const dir = "assets/kenney-tiny-farm/Tiles";
const tiles = [];
for (let ti = 0; ti < 132; ti++) {
  const img = decodePng(readFileSync(`${dir}/tile_${String(ti).padStart(4, "0")}.png`));
  const mini = [];
  for (let my = 0; my < 8; my++) {
    let row = "";
    for (let mx = 0; mx < 8; mx++) {
      // 2x2 block → take the top-left pixel
      const y = my * 2, x = mx * 2;
      const i = (y * 16 + x) * 4;
      row += label(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]);
    }
    mini.push(row);
  }
  tiles.push(mini);
}
// print in sheet order: 12 cols × 11 rows
let out = "";
for (let row = 0; row < 11; row++) {
  out += `╌╌ row ${row} ╌╌\n`;
  for (let my = 0; my < 8; my++) {
    let line = "";
    for (let col = 0; col < 12; col++) {
      const ti = row * 12 + col;
      line += tiles[ti][my] + " ";
    }
    out += line + "\n";
  }
}
console.log(out);
