import { readFileSync } from "node:fs";
const dir = "assets/kenney-tiny-farm/Tiles";
for (const ti of [0, 24, 50, 90, 94]) {
  const buf = readFileSync(`${dir}/tile_${String(ti).padStart(4, "0")}.png`);
  console.log("== tile", ti, "sig:", buf.subarray(0, 16).toString("hex"));
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") console.log("  IHDR", data.readUInt32BE(0) + "x" + data.readUInt32BE(4), "bitDepth", data[8], "colorType", data[9]);
    if (type === "PLTE") {
      let s = "  PLTE (" + len / 3 + " entries):";
      for (let i = 0; i < Math.min(len / 3, 12); i++) s += ` [${i}]${data[i * 3].toString(16).padStart(2, "0")}${data[i * 3 + 1].toString(16).padStart(2, "0")}${data[i * 3 + 2].toString(16).padStart(2, "0")}a${buf[pos + 8 + len + 0] ?? "?"}`;
      console.log(s);
    }
    if (type === "tRNS") console.log("  tRNS(" + data.length + "):", [...data].join(","));
    pos += 12 + len;
  }
}
