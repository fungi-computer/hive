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

function clippedViewport(camera, screen, level) {
  const corners = [
    { x: 0, y: 0 },
    { x: screen.width, y: 0 },
    { x: 0, y: screen.height },
    { x: screen.width, y: screen.height },
  ].map((point) => camera.cell(point, level));
  const minX = Math.max(0, Math.min(...corners.map((cell) => cell.x)));
  const minZ = Math.max(0, Math.min(...corners.map((cell) => cell.z)));
  const maxXExclusive = Math.min(
    SIZE,
    Math.max(...corners.map((cell) => cell.x)) + 1,
  );
  const maxZExclusive = Math.min(
    SIZE,
    Math.max(...corners.map((cell) => cell.z)) + 1,
  );
  return { minX, minZ, maxXExclusive, maxZExclusive };
}

function snapshot(state, level, viewport, requestedCenter) {
  return {
    tick: state.tick,
    paused: state.paused,
    jobs: state.jobs.length,
    level,
    viewport: { ...viewport },
    requestedCenter: requestedCenter ? { ...requestedCenter } : null,
  };
}

function Study() {
  const host = useRef(null);
  const state = useMemo(() => createClearing(), []);
  const facts = useMemo(() => frozenFacts(state), [state]);
  const cameraRef = useRef(null);
  const [level, setLevel] = useState(0);
  const [viewport, setViewport] = useState({
    minX: 0,
    minZ: 0,
    maxXExclusive: SIZE,
    maxZExclusive: SIZE,
  });
  const [requestedCenter, setRequestedCenter] = useState(null);

  useLayoutEffect(() => {
    const { app, camera } = createStudyCamera(host.current);
    cameraRef.current = { app, camera };
    const updateViewport = () =>
      setViewport(clippedViewport(camera, app.screen, level));
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
      setViewport(clippedViewport(current.camera, current.app.screen, level));
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
            requestedCenter={requestedCenter}
            viewport={viewport}
          />
        </div>
        <aside className="study-notes">
          <h2>Caller contract</h2>
          <p>
            The real <code>createClearing()</code> state is read once. The
            component receives an immutable projection and a clipped viewport
            from the real camera inverse-cell API.
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
              <dt>Camera viewport</dt>
              <dd data-testid="camera-viewport">
                [{viewport.minX}, {viewport.minZ}) → [{viewport.maxXExclusive},{" "}
                {viewport.maxZExclusive})
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
