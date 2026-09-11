/** Cosmetic projection of committed field facts. No runtime or mutation access. */
export function drawEnvironmentEffects(graphics, visuals, { project, camera, now, maxY = Infinity }) {
  graphics.clear();
  for (const visual of visuals.slice(0, 64)) {
    if (visual.position.y > maxY || visual.intensity <= 0) continue;
    const point = project(visual.position.x, visual.position.y, visual.position.z);
    const x = point.x * camera.zoom + camera.x;
    const y = point.y * camera.zoom + camera.y;
    const scale = camera.zoom;
    if (visual.kind === "fire") {
      // Quantized phases preserve the low-resolution art's rhythm. This clock
      // changes only the flame silhouette, never burn duration or fuel.
      const phase = Math.floor(now / 120) % 3;
      graphics.rect(x - 5 * scale, y - (8 + phase) * scale, 10 * scale, (8 + phase) * scale).fill({ color: 0xc96035, alpha: visual.intensity });
      graphics.rect(x - 2 * scale, y - (12 - phase) * scale, 4 * scale, (12 - phase) * scale).fill({ color: 0xf1c16f, alpha: visual.intensity });
    } else if (visual.kind === "smoke") {
      // Coverage follows native concentration. Local drift never transports gas.
      const phase = Math.floor(now / 240) % 4;
      const offset = (phase - 1.5) * scale;
      // Perceptual display curve makes light smoke legible at the normal zoom.
      // Zero remains invisible; concentration and simulation stay untouched.
      const opacity = Math.sqrt(visual.intensity);
      graphics.ellipse(x + offset, y - 4 * scale, 15 * scale, 7 * scale).fill({ color: 0x77786d, alpha: opacity * 0.42 });
      graphics.ellipse(x - 5 * scale - offset, y - 10 * scale, 10 * scale, 6 * scale).fill({ color: 0x9b9d8c, alpha: opacity * 0.30 });
    }
  }
}
