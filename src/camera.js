import {
  project,
  projectCell,
  groundCell,
  STOREY_HEIGHT,
  WIDTH,
  HEIGHT,
} from "./art/scale.js";

// Presentation coordinates only. Baked pixels and simulation cells stay fixed.
export function createCamera(app, host, world) {
  let zoom = host.clientWidth >= 900 ? 2 : 1;
  const center = { x: WIDTH / 2, y: HEIGHT / 2 };
  function update() {
    world.scale.set(zoom);
    world.position.set(
      Math.round(app.screen.width / 2 - center.x * zoom),
      Math.round(app.screen.height / 2 - center.y * zoom),
    );
  }
  function resize() {
    app.renderer.resize(host.clientWidth, host.clientHeight);
    update();
  }
  function local(point) {
    return { x: (point.x - world.x) / zoom, y: (point.y - world.y) / zoom };
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return {
    get zoom() {
      return zoom;
    },
    project(x, z, height = 0, level = 0) {
      const p = project(x, z, height + level * STOREY_HEIGHT);
      return { x: p.x * zoom + world.x, y: p.y * zoom + world.y };
    },
    cell(point, level = 0) {
      const p = local(point);
      const ground = projectCell({ x: 0, z: 0, level: 0 });
      const surface = projectCell({ x: 0, z: 0, level });
      return {
        ...groundCell(p.x, p.y - (surface.y - ground.y)),
        level,
      };
    },
    pan(dx, dy) {
      center.x -= dx / zoom;
      center.y -= dy / zoom;
      update();
    },
    zoomBy(
      delta,
      point = { x: app.screen.width / 2, y: app.screen.height / 2 },
    ) {
      const before = local(point);
      zoom = Math.max(1, Math.min(4, zoom + delta));
      center.x = before.x - (point.x - app.screen.width / 2) / zoom;
      center.y = before.y - (point.y - app.screen.height / 2) / zoom;
      update();
    },
    focus(at, screenY = app.screen.height / 2) {
      Object.assign(center, projectCell(at));
      center.y -= (screenY - app.screen.height / 2) / zoom;
      update();
    },
    reset() {
      zoom = host.clientWidth >= 900 ? 2 : 1;
      Object.assign(center, { x: WIDTH / 2, y: HEIGHT / 2 });
      update();
    },
    destroy() {
      observer.disconnect();
    },
  };
}
