// Run with node --experimental-test-module-mocks --test. These tests exercise
// createHiveClient's real startup/event/disposal code with graphics and I/O held
// at explicit barriers; geometry, interpolation, cues and controls remain real.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

let active;
const flush = () => new Promise(resolve => setImmediate(resolve));
class Element {
  clientWidth = 1000;
  clientHeight = 800;
  children = [];
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  addEventListener() {}
  removeEventListener() {}
  remove() {}
}
const point = () => ({ set() {} });
class Container {
  children = [];
  position = point();
  scale = point();
  anchor = point();
  addChild(...children) { this.children.push(...children); }
  removeChildren() { return this.children.splice(0); }
  destroy() {}
}
class Graphics extends Container {
  clear() { return this; }
  rect() { return this; }
  fill() { return this; }
  stroke() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  circle() { return this; }
  poly() { return this; }
}
class Sprite extends Container {
  constructor(texture) { super(); this.texture = texture; }
}
class Application {
  stage = new Container();
  initialized = false;
  canvasValue = new Element();
  destroyed = 0;
  draws = new Set();
  constructor() { active.app = this; }
  async init() { await active.graphics.promise; this.initialized = true; }
  get canvas() { assert(this.initialized, "canvas accessed before init"); return this.canvasValue; }
  get screen() { assert(this.initialized, "screen accessed before init"); return { width: 1000, height: 800 }; }
  get ticker() {
    assert(this.initialized, "ticker accessed before init");
    return { add: draw => this.draws.add(draw), remove: draw => this.draws.delete(draw) };
  }
  destroy() { assert(this.initialized, "destroy called before init"); this.destroyed++; this.initialized = false; }
}

await mock.module("pixi.js", { exports: { Application, Container, Graphics, Sprite } });
await mock.module("react-dom/client", { exports: { createRoot: () => ({ render() {}, unmount() {} }) } });
for (const [module, names] of [
  ["button", ["Button"]], ["slider", ["Slider"]], ["input", ["Input"]], ["card", ["Card", "CardContent"]],
]) await mock.module(`@fungi.computer/caps/components/${module}`, { exports: Object.fromEntries(names.map(name => [name, name])) });
await mock.module("@opentui/keymap/html", { exports: { createDefaultHtmlKeymap: () => ({ registerLayer() {}, on() {} }) } });
await mock.module("@opentui/keymap/extras", { exports: { createBindingLookup: () => ({ bindings: [] }), formatCommandBindings: () => "" } });
await mock.module(new URL("../../../src/art/static-pack.js", import.meta.url).href, { exports: {
  loadStaticArtPack() { active.loads.push("static"); return active.statics.promise; },
} });
await mock.module(new URL("../../../src/art/living-terrain-pack.js", import.meta.url).href, { exports: {
  loadLivingTerrainPack() { active.loads.push("terrain"); return active.terrain.promise; },
} });
await mock.module(new URL("./audio.js", import.meta.url).href, { exports: {
  createAudioOwner: () => ({ play: kind => active.audio.push(kind), dispose() {} }),
} });
await mock.module(new URL("./world-scene-owner.js", import.meta.url).href, { exports: {
  createWorldSceneOwner() {
    const f = active;
    let frame, installed, disposed = false;
    return {
      container: new Container(),
      installTerrainArt(pack) { assert(!disposed); installed = pack; f.installs++; if (f.disposeAfterInstall) queueMicrotask(() => f.client.dispose()); },
      updateTerrain(next) { assert(!disposed); frame = next; },
      presentedTerrain: () => frame,
      position(camera, view) { assert(!disposed); if (frame) f.demand.push({ camera: { ...camera }, level: view.level }); },
      render(input) { assert(!disposed); assert(input.art, "render cannot consume missing art"); f.renders.push(input); return []; },
      resetTimeline() {}, clear() { frame = undefined; }, react() {},
      metrics: () => ({}), snapshot: () => [], pick() {},
      dispose() { assert(!disposed); disposed = true; installed?.dispose(); },
    };
  },
} });

const { createHiveClient } = await import("./client.js");
function fixture({ readyOnStart = true } = {}) {
  const f = { graphics: Promise.withResolvers(), terrain: Promise.withResolvers(), statics: Promise.withResolvers(),
    loads: [], sent: [], demand: [], renders: [], audio: [], installs: 0, runtimeDisposals: 0, subscriptions: 0 };
  active = f;
  globalThis.document = { createElement: () => new Element(), addEventListener() {}, removeEventListener() {}, activeElement: null };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.ResizeObserver = class {
    constructor(callback) { f.resize = callback; }
    observe() {}
    disconnect() {}
  };
  const pack = () => ({ disposed: 0, dispose() { this.disposed++; } });
  f.terrainPack = pack();
  f.staticPack = { ...pack(), art: { ground: {}, effects: { flash: [{}] } } };
  // Static pack's public disposer is intentionally detached by the real client.
  f.staticPack.dispose = () => { f.staticPack.disposed++; };
  f.runtime = {
    subscribe(receive) { f.receive = receive; f.subscriptions++; return () => { f.receive = undefined; f.subscriptions--; }; },
    send(command) { f.sent.push(command); if (command.type === "start" && readyOnStart) f.receive({ type: "ready" }); },
    dispose() { f.runtimeDisposals++; },
  };
  f.client = createHiveClient({ root: new Element(), mode: "colony", runtime: f.runtime,
    persistence: { online: true, statusLabel: "Connected" }, commandDefinitions: {} });
  f.frame = (sequence, cues = []) => ({ type: "frame", epoch: 0, sequence, time: 0,
    facts: [{ id: "worker", visual: "colony.rowan", pose: { position: { x: 17, y: 1, z: -9 }, facing: 0 } }], cues,
    terrain: { revision: 0, placementRevision: 0, verticalMetres: 1,
      surfaces: [{ cell: [17, 0, -9], material: 1 }], structureSurfaces: [], water: [] } });
  return f;
}

test("runtime, camera demand and art load overlap while interaction waits for both", async () => {
  const f = fixture();
  try {
    await flush();
    assert.deepEqual(f.loads, ["terrain", "static"]);
    assert.deepEqual(f.sent, []);
    f.graphics.resolve();
    await flush();
    assert.deepEqual(f.sent, [{ type: "start", game: "colony" }]);
    assert.equal(f.client.state.ready, false);
    assert.equal(f.client.diagnostics().runtimeReady, true);
    assert.equal(f.client.diagnostics().assetsReady, false);
    f.receive(f.frame(1));
    const focused = f.client.diagnostics().camera;
    assert(f.demand.length > 0, "early observation must request camera terrain");
    assert.equal(f.client.diagnostics().frameSequence, 1);
    f.resize();
    assert.deepEqual(f.client.diagnostics().camera, focused, "initial ResizeObserver callback cannot undo actor focus");
    const cue = { sequence: 1, time: 0, kind: "launch", subject: "worker", at: { x: 17, y: 1, z: -9 } };
    f.receive(f.frame(2, [cue]));
    assert.deepEqual(f.audio, [], "cues are retained until art is available");
    assert.equal(f.renders.length, 0);
    f.terrain.resolve(f.terrainPack);
    await flush();
    assert.equal(f.installs, 0);
    f.statics.resolve(f.staticPack);
    await flush();
    assert.equal(f.client.state.ready, true);
    assert.equal(f.installs, 1);
    assert.equal(f.renders.at(-1).frameSequence, 2);
    assert.equal(f.renders.at(-1).subjects[0].id, "worker");
    // The real online interpolation owner retains its 200 ms presentation delay.
    await new Promise(resolve => setTimeout(resolve, 230));
    for (const draw of f.app.draws) draw();
    assert.deepEqual(f.audio, ["launch"], "fresh early cue plays once after art installation");
    for (const draw of f.app.draws) draw();
    assert.deepEqual(f.audio, ["launch"]);
  } finally { f.client.dispose(); }
  assert.equal(f.runtimeDisposals, 1);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
  assert.equal(f.app.destroyed, 1);
});

test("dispose before renderer initialization cleans late resources without starting runtime", async () => {
  const f = fixture();
  f.client.dispose();
  f.client.dispose();
  assert.equal(f.app.destroyed, 0);
  f.terrain.resolve(f.terrainPack);
  f.statics.resolve(f.staticPack);
  f.graphics.resolve();
  await flush();
  assert.equal(f.app.destroyed, 1);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
  assert.equal(f.installs, 0);
  assert.deepEqual(f.sent, []);
  assert.equal(f.runtimeDisposals, 1);
});

test("assets arriving first cannot enable interaction before runtime ready", async () => {
  const f = fixture({ readyOnStart: false });
  try {
    f.graphics.resolve();
    f.terrain.resolve(f.terrainPack);
    f.statics.resolve(f.staticPack);
    await flush();
    assert.equal(f.client.diagnostics().assetsReady, true);
    assert.equal(f.client.diagnostics().runtimeReady, false);
    assert.equal(f.client.state.ready, false);
    f.receive({ type: "ready" });
    assert.equal(f.client.state.ready, true);
  } finally { f.client.dispose(); }
});

test("disposal between art installation and startup continuation cannot register a ticker", async () => {
  const f = fixture();
  f.disposeAfterInstall = true;
  f.graphics.resolve();
  f.terrain.resolve(f.terrainPack);
  f.statics.resolve(f.staticPack);
  await flush();
  assert.equal(f.installs, 1);
  assert.equal(f.app.draws.size, 0);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
  assert.equal(f.app.destroyed, 1);
});

test("dispose after connection but before art stops the subscription and releases late art", async () => {
  const f = fixture();
  f.graphics.resolve();
  await flush();
  assert.equal(f.subscriptions, 1);
  f.client.dispose();
  f.terrain.resolve(f.terrainPack);
  f.statics.resolve(f.staticPack);
  await flush();
  assert.equal(f.subscriptions, 0);
  assert.equal(f.runtimeDisposals, 1);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
  assert.equal(f.app.destroyed, 1);
  assert.equal(f.app.draws.size, 0);
  assert.equal(f.installs, 0);
});

test("art failure closes the early runtime and cleans a late sibling", async () => {
  const f = fixture();
  f.graphics.resolve();
  await flush();
  f.terrain.reject(new Error("terrain hash mismatch"));
  await flush();
  assert.match(f.client.state.message, /Client unavailable: terrain hash mismatch/);
  assert.equal(f.client.state.ready, false);
  assert.equal(f.subscriptions, 0);
  assert.equal(f.runtimeDisposals, 1);
  f.statics.resolve(f.staticPack);
  await flush();
  assert.equal(f.staticPack.disposed, 1);
  assert.equal(f.installs, 0);
  f.client.dispose();
  assert.equal(f.runtimeDisposals, 1);
  assert.equal(f.app.destroyed, 1);
});

test("renderer initialization failure releases loaded art and never starts the world", async () => {
  const f = fixture();
  f.terrain.resolve(f.terrainPack);
  f.statics.resolve(f.staticPack);
  await flush();
  f.graphics.reject(new Error("no WebGL"));
  await flush();
  assert.match(f.client.state.message, /Client unavailable: no WebGL/);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
  assert.deepEqual(f.sent, []);
  f.client.dispose();
  assert.equal(f.app.destroyed, 0);
  assert.equal(f.runtimeDisposals, 1);
});
