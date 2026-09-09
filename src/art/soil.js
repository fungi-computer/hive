import { scene, ball } from "./geometry.js";

// Original loose excavated earth, one visible heap for ordinary physical lots.
export function soilPile(amount) {
  const s = scene();
  const scale = 0.76 + Math.min(3, amount) * 0.08;
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399;
    const r = i ? 0.2 * scale : 0;
    ball(
      s,
      ["#8c6748", "#9e7953", "#72523c"][i % 3],
      Math.cos(a) * r,
      0.09 + (i ? 0 : 0.06),
      Math.sin(a) * r,
      0.21 * scale,
      (i ? 0.13 : 0.2) * scale,
      0.18 * scale,
    );
  }
  for (let i = 0; i < 3; i++)
    ball(
      s,
      "#bea17a",
      (i - 1) * 0.14,
      0.12 + i * 0.035,
      0.14 - i * 0.04,
      0.045,
      0.025,
      0.035,
    );
  return s;
}
