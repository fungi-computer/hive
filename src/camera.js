import {
  project,
  projectCell,
  groundCell,
  STOREY_HEIGHT,
  WIDTH,
  HEIGHT,
} from "./art/scale.js";

function clipPolygonEdge(points, inside, intersection) {
  if (!points.length) return points;
  const clipped = [];
  let previous = points.at(-1);
  let previousInside = inside(previous);
  for (const point of points) {
    const pointInside = inside(point);
    if (pointInside !== previousInside)
      clipped.push(intersection(previous, point));
    if (pointInside) clipped.push(point);
    previous = point;
    previousInside = pointInside;
  }
  return clipped;
}

/** Clips quantized cell centers after converting them to the SVG grid's cell
 * edges. This is an honest grid-space visible-area outline, not a continuous
 * camera frustum. */
export function quantizedVisibleArea(corners, size) {
  const intersection = (axis, value) => (from, to) => {
    const distance = to[axis] - from[axis];
    if (!distance) return { ...from, [axis]: value };
    const ratio = (value - from[axis]) / distance;
    return {
      x: from.x + (to.x - from.x) * ratio,
      z: from.z + (to.z - from.z) * ratio,
    };
  };
  let points = corners.map(({ x, z }) => ({ x: x + 0.5, z: z + 0.5 }));
  points = clipPolygonEdge(
    points,
    (point) => point.x >= 0,
    intersection("x", 0),
  );
  points = clipPolygonEdge(
    points,
    (point) => point.x <= size,
    intersection("x", size),
  );
  points = clipPolygonEdge(
    points,
    (point) => point.z >= 0,
    intersection("z", 0),
  );
  return clipPolygonEdge(
    points,
    (point) => point.z <= size,
    intersection("z", size),
  );
}

/** Keeps one presentation subscriber alive across BFCache suspension without
 * adding a clock or a second camera owner. */
export function subscribeCameraPresentation(camera, update, target = window) {
  let stop = null;
  const attach = () => {
    if (stop) return;
    update();
    stop = camera.subscribe(update);
  };
  const detach = () => {
    stop?.();
    stop = null;
  };
  const dispose = () => {
    detach();
    target.removeEventListener("pagehide", onPageHide);
    target.removeEventListener("pageshow", onPageShow);
  };
  const onPageHide = (event) => {
    detach();
    if (!event.persisted) dispose();
  };
  const onPageShow = (event) => {
    if (event.persisted) attach();
  };
  attach();
  target.addEventListener("pagehide", onPageHide);
  target.addEventListener("pageshow", onPageShow);
  return dispose;
}

// Presentation coordinates only. Baked pixels and simulation cells stay fixed.
export function createCamera(app, host, world) {
  let zoom = host.clientWidth >= 900 ? 2 : 1;
  const center = { x: WIDTH / 2, y: HEIGHT / 2 };
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  function update() {
    world.scale.set(zoom);
    world.position.set(
      Math.round(app.screen.width / 2 - center.x * zoom),
      Math.round(app.screen.height / 2 - center.y * zoom),
    );
    notify();
  }
  function resize() {
    app.renderer.resize(host.clientWidth, host.clientHeight);
    update();
  }
  function local(point) {
    return { x: (point.x - world.x) / zoom, y: (point.y - world.y) / zoom };
  }
  function cell(point, level = 0) {
    const p = local(point);
    const ground = projectCell({ x: 0, z: 0, level: 0 });
    const surface = projectCell({ x: 0, z: 0, level });
    return {
      ...groundCell(p.x, p.y - (surface.y - ground.y)),
      level,
    };
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
    cell,
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
    snapshot(size) {
      const corners = [
        { x: 0, y: 0 },
        { x: app.screen.width, y: 0 },
        { x: app.screen.width, y: app.screen.height },
        { x: 0, y: app.screen.height },
      ];
      return {
        zoom,
        visibleAreas: [0, 1].map((level) => ({
          kind: "quantized-visible-area",
          points: quantizedVisibleArea(
            corners.map((point) => cell(point, level)),
            size,
          ),
        })),
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      observer.disconnect();
      listeners.clear();
    },
  };
}
