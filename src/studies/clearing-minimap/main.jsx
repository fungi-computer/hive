import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { ClearingMinimap } from "../../clearing-minimap.jsx";
import { createCamera } from "../../camera.js";
import { footprint } from "../../construction.js";
import { createClearing } from "../../clearing.ts";
import { SIZE } from "../../world.js";
import "./study.css";

// This caller is intentionally run only after these new files are staged into
// Delivery's clean 19b324b / 09a9f48 worktree. It reads that baseline's real
// createClearing/world/footprint/camera modules; do not run it from a coupled
// dirty gameplay worktree.

function frozenFacts(state) {
  return Object.freeze({
    size: SIZE,
    actors: Object.freeze(
      Object.values(state.actors).map((actor) =>
        Object.freeze({
          id: actor.id,
          name: actor.name,
          x: actor.x,
          z: actor.z,
          level: actor.level,
        }),
      ),
    ),
    trees: Object.freeze(
      state.trees.map((tree) =>
        Object.freeze({
          id: tree.id,
          x: tree.x,
          z: tree.z,
          level: tree.level,
          felled: tree.felledAt !== null,
        }),
      ),
    ),
    structures: Object.freeze(
      state.sites.map((site) =>
        Object.freeze({
          id: site.id,
          type: site.type,
          finished: site.finishedAt !== null,
          cells: Object.freeze(
            footprint(site).map((cell) => Object.freeze({ ...cell })),
          ),
        }),
      ),
    ),
    selectedActorIds: Object.freeze(["rowan"]),
  });
}

function createStudyCamera(host) {
  const world = {
    x: 0,
    y: 0,
    scale: { set() {} },
    position: {
      set(x, y) {
        world.x = x;
        world.y = y;
      },
    },
  };
  const app = {
    screen: { width: host.clientWidth, height: host.clientHeight },
    renderer: {
      resize(width, height) {
        app.screen.width = width;
        app.screen.height = height;
      },
    },
  };
  return { app, camera: createCamera(app, host, world) };
}

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

function clippedCameraPolygon(corners) {
  const horizontal = (axis, value) => (from, to) => {
    const distance = to[axis] - from[axis];
    if (!distance) return { ...from, [axis]: value };
    const ratio = (value - from[axis]) / distance;
    return {
      x: from.x + (to.x - from.x) * ratio,
      z: from.z + (to.z - from.z) * ratio,
    };
  };
  let points = corners.map(({ x, z }) => ({ x, z }));
  points = clipPolygonEdge(points, (point) => point.x >= 0, horizontal("x", 0));
  points = clipPolygonEdge(
    points,
    (point) => point.x <= SIZE,
    horizontal("x", SIZE),
  );
  points = clipPolygonEdge(points, (point) => point.z >= 0, horizontal("z", 0));
  return clipPolygonEdge(
    points,
    (point) => point.z <= SIZE,
    horizontal("z", SIZE),
  );
}

function cameraViewportPolygon(camera, screen, level) {
  const corners = [
    { x: 0, y: 0 },
    { x: screen.width, y: 0 },
    { x: screen.width, y: screen.height },
    { x: 0, y: screen.height },
  ].map((point) => camera.cell(point, level));
  return {
    kind: "quantized-camera-inverse-corner-polygon",
    points: clippedCameraPolygon(corners),
  };
}

function snapshot(state, level, viewport, requestedCenter) {
  return {
    tick: state.tick,
    paused: state.paused,
    jobs: state.jobs.length,
    level,
    viewport: {
      kind: viewport.kind,
      points: viewport.points.map((point) => ({ ...point })),
    },
    requestedCenter: requestedCenter ? { ...requestedCenter } : null,
  };
}

function Study() {
  const host = useRef(null);
  const state = useMemo(() => createClearing(), []);
  const facts = useMemo(() => frozenFacts(state), [state]);
  const cameraRef = useRef(null);
  const [level, setLevel] = useState(0);
  const levelRef = useRef(level);
  levelRef.current = level;
  const [viewport, setViewport] = useState({
    kind: "quantized-camera-inverse-corner-polygon",
    points: [
      { x: 0, z: 0 },
      { x: SIZE, z: 0 },
      { x: SIZE, z: SIZE },
      { x: 0, z: SIZE },
    ],
  });
  const [requestedCenter, setRequestedCenter] = useState(null);

  useLayoutEffect(() => {
    const { app, camera } = createStudyCamera(host.current);
    cameraRef.current = { app, camera };
    const updateViewport = () =>
      setViewport(cameraViewportPolygon(camera, app.screen, levelRef.current));
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      camera.destroy();
      cameraRef.current = null;
    };
  }, []);

  useEffect(() => {
    const current = cameraRef.current;
    if (current)
      setViewport(
        cameraViewportPolygon(current.camera, current.app.screen, level),
      );
  }, [level]);

  useEffect(() => {
    window.__CLEARING_MINIMAP_STUDY = {
      ready: true,
      get snapshot() {
        return snapshot(state, level, viewport, requestedCenter);
      },
      get facts() {
        return structuredClone(facts);
      },
    };
    return () => delete window.__CLEARING_MINIMAP_STUDY;
  }, [facts, level, requestedCenter, state, viewport]);

  const stateBefore = snapshot(state, level, viewport, null);
  return (
    <main className="study-shell">
      <header className="study-heading">
        <p>Local-only Clearing component study</p>
        <h1>One small clearing, one camera request</h1>
        <span>
          Frozen baseline state · tick {state.tick} · {state.jobs.length} jobs
        </span>
      </header>
      <section className="study-layout">
        <div className="study-map-host" ref={host}>
          <div className="level-switch" role="group" aria-label="Logical level">
            <button
              aria-pressed={level === 0}
              onClick={() => setLevel(0)}
              type="button"
            >
              Ground
            </button>
            <button
              aria-pressed={level === 1}
              onClick={() => setLevel(1)}
              type="button"
            >
              Upper
            </button>
          </div>
          <ClearingMinimap
            facts={facts}
            level={level}
            onRequestCenter={setRequestedCenter}
            viewport={viewport}
          />
        </div>
        <aside className="study-notes">
          <h2>Caller contract</h2>
          <p>
            The real <code>createClearing()</code> state is read once. The
            component receives an immutable projection and a clipped, quantized
            inverse-corner polygon from the real camera cell API.
          </p>
          <dl>
            <div>
              <dt>Requested center</dt>
              <dd data-testid="requested-center">
                {requestedCenter
                  ? `${requestedCenter.x}, ${requestedCenter.z} · L${requestedCenter.level}`
                  : "none"}
              </dd>
            </div>
            <div>
              <dt>Camera inverse footprint</dt>
              <dd data-testid="camera-viewport">
                {viewport.points
                  .map(
                    (point) => `(${point.x.toFixed(2)}, ${point.z.toFixed(2)})`,
                  )
                  .join(" → ")}
              </dd>
            </div>
            <div>
              <dt>State after click</dt>
              <dd data-testid="state-integrity">
                tick {state.tick} · jobs {state.jobs.length} · paused{" "}
                {String(state.paused)} · baseline tick {stateBefore.tick}
              </dd>
            </div>
          </dl>
          <p className="study-limit">
            The request is displayed only. This study never calls camera focus,
            changes selection, submits a command, advances a tick, or writes a
            save.
          </p>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.querySelector("#clearing-minimap-study")).render(<Study />);
