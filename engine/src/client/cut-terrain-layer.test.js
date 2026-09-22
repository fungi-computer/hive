import { materialPatch } from "../runtime/terrain-region-fixture.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Sprite, Texture } from "pixi.js";
import { createCutTerrainLayer, waterDrawRecord } from "./cut-terrain-layer.js";
import { createCameraGeometryOwner } from "./camera-geometry-owner.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { createVisibleHitArea } from "../../../src/visual-hit-geometry.js";

const bounds = { minX: 0, maxX: 16, minY: -8, maxY: 8, minZ: 0, maxZ: 8 };
const camera = { x: 0, y: 0, zoom: 1 },
  screen = { width: 640, height: 400 },
  view = { cutaway: true, level: 0 };
const grass = { kind: "grass", condition: "green", height: "full" };
function frame(world = bounds, surfaces = []) {
  return {
    revision: 1,
    placementRevision: 1,
    verticalMetres: 0.54,
    baseline: {
      protocolVersion: 5,
      bounds: world,
      verticalMetres: 0.54,
      materials: [
        { slot: 0, solid: false },
        { slot: 1, solid: true, art: "earth" },
      ],
    },
    surfaces,
    structureSurfaces: [],
    water: [],
  };
}
function patch(key, world = bounds, cover) {
  const result = materialPatch(key, world, ([, y]) => (y <= 0 ? 1 : 0)),
    c = result.coverage;
  for (let x = c.minX; x < c.maxX; x++)
    for (let z = c.minZ; z < c.maxZ; z++)
      result.surfaces.push({
        cell: [x, 0, z],
        material: 1,
        generatedTop: 0,
        ...(cover ? { cover } : {}),
      });
  return result;
}

const inputs = new WeakMap();
function setFrame(layer, frame, epoch) {
  const input = { ...inputs.get(layer), frame, epoch };
  inputs.set(layer, input);
  if (!frame) layer.clear();
}
function show(layer, cam = camera, v = view, size = screen) {
  const input = { ...inputs.get(layer), camera: cam, view: v, screen: size };
  inputs.set(layer, input);
  layer.transform(cam);
  if (!input.frame) return;
  layer.request(input);
  return publish(layer, layer.prepare());
}
function setProjection(layer, projection, turn) {
  const input = { ...inputs.get(layer), projection, turn };
  inputs.set(layer, input);
  layer.request(input);
}

function setup({ world = bounds, auto = true, cover, onCoverage, clock } = {}) {
  const requests = [];
  let depth = 0,
    maxDepth = 0;
  const runtime = {
    terrainRegions(request, receive) {
      const entry = {
        request,
        cancelled: false,
        send: (event) => receive({ ...request, ...event }),
      };
      requests.push(entry);
      if (auto)
        queueMicrotask(() => {
          for (const key of request.regions)
            entry.send({ kind: "patch", patch: patch(key, world, cover) });
          entry.send({ kind: "complete" });
        });
      return () => {
        entry.cancelled = true;
      };
    },
  };
  const projection = createOrderingProjection();
  const layer = createCutTerrainLayer({
    runtime,
    projection,
    clock,
    onCoverage: (event) => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      try {
        onCoverage?.(event, layer);
      } finally {
        depth--;
      }
    },
  });
  inputs.set(layer, { camera, view, screen, projection, turn: 0 });
  const styles = new Map(),
    hitArea = createVisibleHitArea(
      {
        width: 64,
        height: 64,
        rows: Array.from({ length: 65 }, (_, y) => y),
        spans: Array.from({ length: 64 }, () => [24, 39]).flat(),
      },
      { x: 0.5, y: 0.5 },
    );
  const style = (height) => {
    if (!styles.has(height))
      styles.set(height, {
        texture: height === "short" ? Texture.EMPTY : Texture.WHITE,
        uvs: [0, 0, 0, 1, 1, 1, 1, 0],
        hitArea,
      });
    return styles.get(height);
  };
  return {
    layer,
    projection,
    requests,
    maxDepth: () => maxDepth,
    install: () =>
      layer.installArt({
        body: () => style("body"),
        cover: ({ height }) => style(height),
        dispose() {},
      }),
  };
}
async function ready(layer, cam = camera, v = view, size = screen) {
  for (let i = 0; i < 10; i++) {
    show(layer, cam, v, size);
    if (layer.coverage.demandComplete) return;
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.fail("region demand stalled");
}

test("live regions paint incrementally, retain body identity and never require all padding", () => {
  const { layer, requests, install } = setup({ auto: false });
  install();
  setFrame(layer, frame(), 2);
  show(layer, camera, view, screen);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.regions.length, 2);
  const [first, second] = requests[0].request.regions;
  requests[0].send({ kind: "patch", patch: patch(first) });
  show(layer, camera, view, screen);
  const partial = layer.retainedRecords;
  assert(partial.records.length > 0);
  assert.equal(layer.coverage.demandComplete, false);
  assert(
    layer.presentedTerrain.exposedFaces.length > 0,
    "picking is available before completion",
  );
  requests[0].send({ kind: "patch", patch: patch(second) });
  show(layer, camera, view, screen);
  assert(layer.retainedRecords.records.length > partial.records.length);
  assert(
    partial.records.every((record) =>
      layer.retainedRecords.records.includes(record),
    ),
    "later patches keep existing face identity",
  );
  requests[0].send({ kind: "complete" });
  assert(layer.coverage.demandComplete);
  layer.dispose();
});

test("camera pan transform and unchanged padded demand do not rebuild terrain", async () => {
  const { layer, requests, install, maxDepth } = setup({
    onCoverage: (_, owner) => show(owner, camera, view, screen),
  });
  install();
  const terrain = frame();
  terrain.water = [{ at: [4, 0, 4], level: 4, liquidVolumeM3: 0.5 }];
  setFrame(layer, terrain, 2);
  await ready(layer);
  const before = layer.retainedRecords,
    water = before.records.find((record) => record.role === "water");
  assert(water);
  show(layer, { ...camera, x: 8, y: 4, zoom: 2 }, view, screen);
  assert.equal(layer.container.x, 8);
  assert.equal(layer.container.scale.x, 2);
  assert.equal(layer.retainedRecords.revision, before.revision);
  assert.strictEqual(layer.retainedRecords.records, before.records);
  setFrame(
    layer,
    { ...terrain, water: [{ ...terrain.water[0], liquidVolumeM3: 0.8 }] },
    2,
  );
  show(layer, camera, view, screen);
  assert.strictEqual(
    layer.retainedRecords.records.find((record) => record.role === "water"),
    water,
  );
  assert.equal(requests.length, 1);
  assert.equal(maxDepth(), 1);
  layer.dispose();
});

test("resident material supplies new cut caps without cancelling reads; epochs invalidate facts", () => {
  const { layer, requests, install } = setup({ auto: false, cover: grass });
  install();
  setFrame(layer, frame(), 1);
  show(layer, camera, view, screen);
  const old = requests[0];
  for (const key of old.request.regions)
    old.send({ kind: "patch", patch: patch(key, bounds, grass) });
  show(layer, camera, view, screen);
  assert(
    layer.retainedRecords.records.some(
      (record) => record.role === "terrain-cover",
    ),
  );
  for (const level of [-1, -2, -3]) {
    show(layer, camera, { ...view, level }, screen);
    assert(!old.cancelled);
    assert.equal(requests.length, 1);
    assert(layer.retainedRecords.records.length > 0);
    assert(
      layer.retainedRecords.records.every(
        (record) => record.cap && record.cell[1] === level,
      ),
    );
  }
  show(layer, camera, view, screen);
  assert(
    layer.retainedRecords.records.some(
      (record) => record.role === "terrain-cover",
    ),
  );
  setFrame(layer, frame(), 2);
  show(layer, camera, view, screen);
  assert.equal(layer.retainedRecords.records.length, 0);
  assert(old.cancelled);
  layer.dispose();
});

test("complete region halos own seam masks and world-min edge blades without duplicates", async () => {
  const { layer, install } = setup({ cover: grass });
  install();
  setFrame(layer, frame(), 1);
  await ready(layer);
  const cover = layer.retainedRecords.records.filter(
    (record) => record.role === "terrain-cover",
  );
  assert.equal(new Set(cover.map((record) => record.id)).size, cover.length);
  assert.equal(
    cover.length,
    17 * 9,
    "every dual-grid root including the outer edges is owned exactly once",
  );
  const seam = cover.find(
    (record) =>
      record.attachment.point.x === 7.5 && record.attachment.point.z === 3.5,
  );
  assert.equal(seam.mask, 15);
  assert.equal(seam.attachment.supports.length, 4);
  layer.dispose();
});

test("observed full/short cover overrides halo facts without reading terrain or replacing body", async () => {
  const { layer, install, requests } = setup({ cover: grass });
  install();
  const terrain = frame();
  setFrame(layer, terrain, 1);
  await ready(layer);
  const before = layer.retainedRecords.records,
    body = before.filter((record) => record.role === "terrain"),
    cover = before.filter((record) => record.role === "terrain-cover");
  setFrame(
    layer,
    {
      ...terrain,
      surfaces: [
        {
          cell: [7, 0, 3],
          material: 1,
          generatedTop: 0,
          cover: { ...grass, height: "short" },
        },
      ],
    },
    1,
  );
  show(layer, camera, view, screen);
  const after = layer.retainedRecords.records;
  assert(body.every((record) => after.includes(record)));
  assert(after.some((record) => record.terrainBatch.texture === Texture.EMPTY));
  assert(
    after.some((record) => cover.includes(record)),
    "unaffected region cover keeps record identity",
  );
  assert.equal(requests.length, 1);
  layer.dispose();
});

test("surface references survive water updates while replacement cover still publishes", async () => {
  const { layer, install, requests } = setup({ cover: grass });
  install();
  const terrain = frame(bounds, [
    { cell: [7, 0, 3], material: 1, generatedTop: 0, cover: grass },
  ]);
  try {
    setFrame(layer, terrain, 1);
    await ready(layer);
    const ground = layer.retainedRecords.records;
    const wet = {
      ...terrain,
      water: [{ at: [4, 0, 3], level: 3, liquidVolumeM3: 0.1 }],
    };
    setFrame(layer, wet, 1);
    show(layer, camera, view, screen);
    const firstWater = layer.retainedRecords.records.find(
      (record) => record.role === "water",
    );
    assert(firstWater);
    assert(
      ground.every((record) => layer.retainedRecords.records.includes(record)),
    );
    setFrame(layer, { ...wet, water: [{ ...wet.water[0], level: 5 }] }, 1);
    show(layer, camera, view, screen);
    assert.notStrictEqual(
      layer.retainedRecords.records.find((record) => record.role === "water"),
      firstWater,
    );
    assert(
      ground.every((record) => layer.retainedRecords.records.includes(record)),
    );
    setFrame(
      layer,
      {
        ...wet,
        surfaces: [
          { ...terrain.surfaces[0], cover: { ...grass, height: "short" } },
        ],
      },
      1,
    );
    show(layer, camera, view, screen);
    assert(
      layer.retainedRecords.records.some(
        (record) =>
          record.role === "terrain-cover" && record.id.endsWith(":short"),
      ),
    );
    assert.equal(requests.length, 1);
  } finally {
    layer.dispose();
  }
});

test("patches can arrive before art; empty and oversized demands never preserve stale paint", async () => {
  const world = { ...bounds, minX: -512, maxX: 512, minZ: -512, maxZ: 512 };
  const { layer, install } = setup({ world });
  setFrame(layer, frame(world), 1);
  show(layer, camera, view, screen);
  await Promise.resolve();
  await Promise.resolve();
  assert(layer.coverage.receivedComplete);
  assert.equal(layer.coverage.demandComplete, false);
  assert.equal(layer.retainedRecords.records.length, 0);
  install();
  show(layer, camera, view, screen);
  assert(layer.retainedRecords.records.length > 0);
  show(layer, camera, view, { width: 40000, height: 40000 });
  assert.equal(layer.retainedRecords.records.length, 0);
  show(layer, camera, view, screen);
  assert(layer.retainedRecords.records.length > 0);
  show(layer, { ...camera, x: 100000 }, view, screen);
  assert.equal(layer.retainedRecords.records.length, 0);
  assert.equal(layer.presentedTerrain.exposedFaces.length, 0);
  layer.dispose();
  assert.equal(layer.coverage.cachedRegions, 0);
  assert.equal(layer.coverage.retainedBytes, 0);
  assert.equal(layer.presentedTerrain, undefined);
});

test("clear and dispose release subscriptions, current records, water and cached world facts", async () => {
  const { layer, install, requests } = setup();
  install();
  setFrame(
    layer,
    { ...frame(), water: [{ at: [4, 0, 4], level: 4, liquidVolumeM3: 0.5 }] },
    1,
  );
  await ready(layer);
  setFrame(layer, undefined, undefined);
  assert.equal(layer.retainedRecords.records.length, 0);
  assert.equal(layer.coverage.cachedRegions, 0);
  assert.equal(layer.coverage.retainedBytes, 0);
  assert(requests.every((request) => request.cancelled));
  assert.equal(layer.container.children.length, 0);
  layer.dispose();
  layer.dispose();
});

test("water remains one non-pickable liquid surface at its actual fill height", () => {
  const record = waterDrawRecord(
    { at: [4, -2, 7], level: 5, liquidVolumeM3: 0.5 },
    { verticalMetres: 0.56 },
  );
  assert.equal(record.pickable, false);
  assert.equal("supports" in record.attachment, false);
  assert(
    Math.abs(record.footprint[0].y - (-2.5 * 0.56 + (5 / 7) * 0.56)) < 1e-12,
  );
});

test("browser patch notifications coalesce until the next animation frame", async () => {
  const original = globalThis.requestAnimationFrame,
    cancelOriginal = globalThis.cancelAnimationFrame;
  const callbacks = new Map();
  let sequence = 0,
    notifications = 0;
  globalThis.requestAnimationFrame = (callback) => {
    callbacks.set(++sequence, callback);
    return sequence;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  const { layer, requests, install } = setup({
    auto: false,
    onCoverage: () => notifications++,
  });
  try {
    install();
    setFrame(layer, frame(), 1);
    show(layer, camera, view, screen);
    for (const key of requests[0].request.regions) {
      requests[0].send({ kind: "patch", patch: patch(key) });
      await Promise.resolve();
    }
    assert.equal(callbacks.size, 1);
    assert.equal(notifications, 0);
    const callback = callbacks.values().next().value;
    callbacks.clear();
    callback();
    assert.equal(notifications, 1);
    requests[0].send({ kind: "complete" });
    await Promise.resolve();
    assert.equal(callbacks.size, 1);
    layer.dispose();
    assert.equal(callbacks.size, 0);
  } finally {
    layer.dispose();
    globalThis.requestAnimationFrame = original;
    globalThis.cancelAnimationFrame = cancelOriginal;
  }
});

test("region face facts survive rotation without terrain reads and unknown columns cannot grow observed grass", async () => {
  const { createCameraGeometryOwner } =
    await import("./camera-geometry-owner.js");
  const geometry = createCameraGeometryOwner(),
    { layer, install, requests } = setup({ auto: false });
  try {
    install();
    setFrame(
      layer,
      frame(bounds, [
        { cell: [4, 0, 4], material: 1, generatedTop: 0, cover: grass },
      ]),
      1,
    );
    show(layer, camera, view, screen);
    const current = requests[0];
    for (const key of current.request.regions)
      current.send({ kind: "patch", patch: { ...patch(key), surfaces: [] } });
    current.send({ kind: "complete" });
    show(layer, camera, view, screen);
    assert(layer.retainedRecords.records.length > 0);
    assert(
      layer.retainedRecords.records.every(
        (record) => record.role === "terrain",
      ),
    );
    for (let turn = 1; turn < 4; turn++) {
      setProjection(layer, geometry.rotate(1), turn);
      show(layer, camera, view, screen);
      assert(layer.retainedRecords.records.length > 0);
      assert.equal(requests.length, 1, "all orientations are already resident");
    }
  } finally {
    layer.dispose();
    geometry.dispose();
  }
});

test("prepared viewport culls resident faces and grass, retains small pans, and reculls unchanged region membership", async () => {
  const world = { ...bounds, maxX: 8, maxZ: 8 },
    size = { width: 20, height: 20 },
    startCamera = { x: -220, y: -230, zoom: 1 };
  const { layer, install, requests } = setup({ world, cover: grass });
  install();
  setFrame(layer, frame(world), 1);
  try {
    await ready(layer, startCamera, view, size);
    const before = layer.retainedRecords,
      prepared = layer.cameraCoverage.prepared;
    assert.equal(layer.coverage.cachedRegions, 1);
    const body = before.records.filter((record) => record.role === "terrain");
    const cover = before.records.filter(
      (record) => record.role === "terrain-cover",
    );
    assert(
      body.length > 0 && body.length < 64,
      "resident patch faces outside prepared area are not materialized",
    );
    assert(
      cover.length > 0 && cover.length < 81,
      "resident patch grass outside prepared area is not materialized",
    );
    show(layer, { ...startCamera, x: -240 }, view, size);
    assert.strictEqual(layer.retainedRecords.records, before.records);
    assert.equal(layer.retainedRecords.revision, before.revision);
    assert.deepEqual(layer.cameraCoverage.prepared, prepared);
    show(layer, { ...startCamera, x: -320 }, view, size);
    const after = layer.retainedRecords;
    assert.notDeepEqual(layer.cameraCoverage.prepared, prepared);
    assert.equal(
      requests.length,
      1,
      "same resident patch supplies the newly prepared area",
    );
    assert(
      after.records.some(
        (record) => !before.records.some((old) => old.id === record.id),
      ),
      "replan admits newly covered geometry despite unchanged cache publication",
    );
    const oldById = new Map(
      before.records.map((record) => [record.id, record]),
    );
    const survivors = after.records.filter((record) => oldById.has(record.id));
    assert(survivors.length > 0);
    assert(
      survivors.every((record) => record === oldById.get(record.id)),
      "surviving body and cover retain exact picking and ordering identity",
    );
    assert.deepEqual(
      layer.presentedTerrain.exposedFaces,
      after.records.filter((record) => record.role === "terrain"),
    );
  } finally {
    layer.dispose();
  }
});

test("empty and offscreen patch progress preserves presentation identity while visible arrivals publish", () => {
  for (const offscreen of [false, true])
    for (const emptyFirst of [true, false]) {
      const camera = { x: -220, y: -230, zoom: 1 },
        screen = { width: 20, height: 20 };
      const { layer, requests, install } = setup({ auto: false });
      install();
      setFrame(layer, frame(), 1);
      show(layer, camera, view, screen);
      try {
        const stream = requests[0],
          [visibleKey, emptyKey] = stream.request.regions;
        const empty = () =>
          stream.send({
            kind: "patch",
            patch: materialPatch(emptyKey, bounds, ([x, y, z]) =>
              offscreen && x === 15 && y === 0 && z === 0 ? 1 : 0,
            ),
          });
        const visible = () =>
          stream.send({ kind: "patch", patch: patch(visibleKey) });
        if (!emptyFirst) {
          visible();
          show(layer, camera, view, screen);
        }
        const before = layer.retainedRecords,
          presented = layer.presentedTerrain,
          readyBefore = layer.coverage.cachedRegions;
        empty();
        show(layer, camera, view, screen);
        assert.equal(
          layer.coverage.cachedRegions,
          readyBefore + 1,
          "cache progress is published independently",
        );
        assert.equal(layer.retainedRecords.revision, before.revision);
        assert.strictEqual(layer.retainedRecords.records, before.records);
        assert.strictEqual(layer.presentedTerrain, presented);
        assert.strictEqual(layer.presentedTerrain.surfaces, presented.surfaces);
        if (emptyFirst) {
          visible();
          show(layer, camera, view, screen);
          assert.equal(layer.retainedRecords.revision, before.revision + 1);
          assert(layer.retainedRecords.records.length > 0);
        }
      } finally {
        layer.dispose();
      }
    }
});

test("vertical slabs share exterior grass facts but emit each blade patch only once", async () => {
  const world = { ...bounds, maxY: 300 },
    topView = { cutaway: true, level: 299 };
  const { layer, install, requests } = setup({ world, cover: grass });
  install();
  setFrame(layer, frame(world), 1);
  try {
    await ready(layer, camera, topView);
    assert(
      requests[0].request.regions.some((key) => key[2] === 2),
      "test must include upper slabs",
    );
    const cover = layer.retainedRecords.records.filter(
      (record) => record.role === "terrain-cover",
    );
    assert.equal(cover.length, 17 * 9);
    assert.equal(new Set(cover.map((record) => record.id)).size, cover.length);
    show(layer, camera, { ...topView, level: -1 }, screen);
    assert(
      !layer.retainedRecords.records.some(
        (record) => record.role === "terrain-cover",
      ),
    );
    show(layer, camera, topView, screen);
    assert.equal(
      requests.length,
      1,
      "return uses material slabs already received",
    );
    assert.equal(
      layer.retainedRecords.records.filter(
        (record) => record.role === "terrain-cover",
      ).length,
      cover.length,
    );
  } finally {
    layer.dispose();
  }
});

function drain(task, maxOperations = 128) {
  let advances = 0;
  while (!task.ready) {
    assert.equal(task.status, "pending");
    assert(++advances < 10000, "terrain preparation stalled");
    task.advance({ maxOperations });
  }
  return task.result;
}
function publish(layer, task) {
  const result = drain(task);
  if (result.records !== layer.retainedRecords.records) {
    const meshes = task.prepareOrder(result.records);
    while (!meshes.advance({ records: 128, meshes: 2 })) {}
  }
  task.publish();
  assert.strictEqual(
    task.result,
    result,
    "publication keeps the pinned result available",
  );
  return result;
}
function ask(owner, source, extra = {}) {
  owner.layer.request({
    frame: source,
    epoch: 1,
    camera,
    screen,
    view,
    projection: owner.projection,
    turn: 0,
    ...extra,
  });
}
function deliver(owner) {
  const stream = owner.requests.at(-1);
  for (const key of stream.request.regions)
    stream.send({ kind: "patch", patch: patch(key) });
  stream.send({ kind: "complete" });
}

test("received coverage becomes displayed only at publication; requests and arrivals never cancel a pinned task", () => {
  const owner = setup({ auto: false }),
    { layer } = owner,
    source = frame();
  owner.install();
  ask(owner, source);
  const stream = owner.requests[0],
    first = stream.request.regions[0];
  stream.send({ kind: "patch", patch: patch(first) });
  const task = layer.prepare();
  task.advance({ maxOperations: 1 });
  assert.equal(task.status, "pending");
  const newer = { ...source, placementRevision: 9 };
  ask(owner, newer);
  for (const key of stream.request.regions.slice(1))
    stream.send({ kind: "patch", patch: patch(key) });
  stream.send({ kind: "complete" });
  assert.equal(task.status, "pending");
  assert(layer.coverage.receivedComplete);
  assert.equal(layer.coverage.demandComplete, false);
  const partial = drain(task);
  assert.equal(
    partial.terrainFrame.placementRevision,
    1,
    "candidate pins its observation",
  );
  assert.equal(layer.retainedRecords.records.length, 0);
  assert.equal(layer.coverage.visibleComplete, false);
  publish(layer, task);
  assert.equal(layer.coverage.displayedRegions, 1);
  assert.equal(layer.coverage.demandComplete, false);
  const next = publish(layer, layer.prepare());
  assert.equal(next.terrainFrame.placementRevision, 9);
  assert(layer.coverage.demandComplete);
  assert(layer.coverage.visibleComplete);
  assert.equal(layer.coverage.displayedRegions, 2);
  layer.dispose();
});

test("cut and projection requests preserve published pictures, water, meshes and picking until commit", () => {
  const owner = setup({ auto: false }),
    { layer } = owner;
  const source = {
    ...frame(),
    water: [{ at: [4, 0, 4], level: 3, liquidVolumeM3: 0.1 }],
  };
  owner.install();
  ask(owner, source);
  deliver(owner);
  publish(layer, layer.prepare());
  const before = layer.retainedRecords,
    terrainFrame = layer.presentedTerrain,
    children = [...layer.container.children];
  const positions = children
    .filter((child) => child.geometry)
    .map((child) => [child, [...child.geometry.positions]]);
  const water = before.records.find(
    (record) => record.role === "water",
  ).display;
  ask(owner, source, { view: { cutaway: true, level: -2 } });
  assert(layer.coverage.receivedComplete);
  assert.equal(layer.coverage.demandComplete, false);
  assert.strictEqual(layer.retainedRecords.records, before.records);
  assert.strictEqual(layer.presentedTerrain, terrainFrame);
  const task = layer.prepare();
  drain(task, 1);
  const meshes = task.prepareOrder(task.result.records);
  while (!meshes.advance({ records: 1, meshes: 1 })) {}
  assert.deepEqual(layer.container.children, children);
  assert.equal(water.destroyed, false);
  for (const [mesh, data] of positions)
    assert.deepEqual([...mesh.geometry.positions], data);
  layer.transform({ x: 12, y: 24, zoom: 2 });
  assert.equal(layer.container.x, 12);
  assert.equal(layer.container.scale.x, 2);
  task.cancel();
  assert.equal(task.status, "cancelled");
  assert.strictEqual(layer.presentedTerrain, terrainFrame);
  assert.deepEqual(layer.container.children, children);
  assert.equal(water.destroyed, false);
  const successor = publish(layer, layer.prepare());
  assert(
    successor.records.every((record) => record.cap && record.cell[1] === -2),
  );
  assert(water.destroyed);
  assert(layer.coverage.demandComplete);
  assert.equal(owner.requests.length, 1);
  const geometry = createCameraGeometryOwner(),
    rotated = geometry.rotate(1);
  ask(owner, source, { projection: rotated, turn: 1 });
  assert.equal(layer.coverage.demandComplete, false);
  assert.strictEqual(layer.retainedRecords.records, successor.records);
  const rotation = publish(layer, layer.prepare());
  assert.strictEqual(rotation.projection, rotated);
  assert.equal(rotation.turn, 1);
  assert(layer.coverage.demandComplete);
  layer.dispose();
  geometry.dispose();
});

test("water replacement is detached through preparation and cancellation retires only owned sprites", () => {
  const owner = setup({ auto: false }),
    { layer } = owner,
    cell = { at: [4, 0, 4], level: 3, liquidVolumeM3: 0.1 };
  const source = { ...frame(), water: [cell] };
  owner.install();
  ask(owner, source);
  deliver(owner);
  publish(layer, layer.prepare());
  const old = layer.retainedRecords.records.find(
      (record) => record.role === "water",
    ),
    oldPoint = { x: old.display.x, y: old.display.y };
  let oldDestroyed = 0;
  const destroyOld = old.display.destroy.bind(old.display);
  old.display.destroy = (...args) => {
    oldDestroyed++;
    destroyOld(...args);
  };
  ask(owner, { ...source, water: [{ ...cell, level: 6 }] });
  const task = layer.prepare(),
    result = drain(task);
  const replacement = result.records.find((record) => record.role === "water");
  assert.notStrictEqual(replacement.display, old.display);
  assert.equal(replacement.display.parent, null);
  assert.deepEqual({ x: old.display.x, y: old.display.y }, oldPoint);
  assert.equal(oldDestroyed, 0);
  let replacedDestroyed = 0;
  const destroyNew = replacement.display.destroy.bind(replacement.display);
  replacement.display.destroy = (...args) => {
    replacedDestroyed++;
    destroyNew(...args);
  };
  task.cancel();
  task.cancel();
  assert.equal(replacedDestroyed, 1);
  assert.equal(oldDestroyed, 0);
  const next = publish(layer, layer.prepare()),
    nextWater = next.records.find((record) => record.role === "water");
  assert.equal(oldDestroyed, 1);
  assert.strictEqual(nextWater.display.parent, layer.container);
  layer.dispose();
  assert(nextWater.display.destroyed);
  assert.equal(oldDestroyed, 1);
});

test("unchanged terrain skips picture work and preserves records across actor observations and liquid mass changes", () => {
  const owner = setup({ auto: false }),
    { layer } = owner,
    source = {
      ...frame(),
      water: [{ at: [4, 0, 4], level: 3, liquidVolumeM3: 0.1 }],
    };
  owner.install();
  ask(owner, source);
  deliver(owner);
  publish(layer, layer.prepare());
  const before = layer.retainedRecords,
    metrics = layer.pictureMetrics;
  for (let i = 0; i < 10; i++) {
    ask(owner, {
      ...source,
      placementRevision: 10 + i,
      water: [{ ...source.water[0], liquidVolumeM3: 0.2 + i / 100 }],
    });
    const result = publish(layer, layer.prepare());
    assert.strictEqual(result.records, before.records);
    assert.equal(result.revision, before.revision);
    assert.equal(result.terrainFrame.placementRevision, 10 + i);
  }
  assert.deepEqual(
    layer.pictureMetrics,
    metrics,
    "actor and mass-only frames do not traverse terrain pictures",
  );
  layer.dispose();
});

test("new prepared viewport, epoch and revision cannot report old paint as complete", () => {
  const owner = setup({ auto: false }),
    { layer } = owner,
    source = frame();
  owner.install();
  ask(owner, source);
  deliver(owner);
  publish(layer, layer.prepare());
  assert(layer.coverage.demandComplete);
  const before = layer.retainedRecords.records;
  ask(owner, source, { camera: { ...camera, x: -150 } });
  assert.equal(layer.coverage.demandComplete, false);
  assert.strictEqual(layer.retainedRecords.records, before);
  publish(layer, layer.prepare());
  assert(layer.coverage.demandComplete);
  const changed = { ...source, revision: 2 };
  ask(owner, changed);
  assert.equal(layer.coverage.demandComplete, false);
  assert.equal(layer.coverage.receivedComplete, false);
  deliver(owner);
  assert(layer.coverage.receivedComplete);
  assert.equal(layer.coverage.demandComplete, false);
  publish(layer, layer.prepare());
  assert(layer.coverage.demandComplete);
  ask(owner, changed, { epoch: 2 });
  assert.equal(layer.coverage.demandComplete, false);
  deliver(owner);
  assert(layer.coverage.receivedComplete);
  publish(layer, layer.prepare());
  assert(layer.coverage.demandComplete);
  layer.dispose();
});

test("water admission failures and exhausted deadlines leave the displayed scene intact", () => {
  const owner = setup({ auto: false, clock: () => 10 }),
    { layer } = owner,
    source = frame();
  owner.install();
  ask(owner, source);
  deliver(owner);
  const initial = layer.prepare();
  initial.advance({ maxOperations: 1, deadline: 10 });
  assert.equal(initial.status, "pending");
  assert.equal(layer.pictureMetrics.operations, 0);
  publish(layer, initial);
  const before = layer.retainedRecords.records;
  ask(owner, {
    ...source,
    water: Array.from({ length: 2049 }, (_, x) => ({
      at: [x, 0, 0],
      level: 3,
      liquidVolumeM3: 1,
    })),
  });
  const over = layer.prepare();
  assert.throws(() => drain(over), /water view-budget exceeded/);
  assert.equal(over.status, "failed");
  assert.strictEqual(layer.retainedRecords.records, before);
  assert.equal(layer.meshMetrics.pendingMeshes, 0);
  ask(owner, {
    ...source,
    water: [
      { at: [1, 0, 0], level: 3, liquidVolumeM3: 1 },
      { at: [1, 0, 0], level: 4, liquidVolumeM3: 1 },
    ],
  });
  const duplicate = layer.prepare();
  assert.throws(() => drain(duplicate), /duplicate terrain water cell/);
  assert.strictEqual(layer.retainedRecords.records, before);
  layer.dispose();
});

test("clear cancels ready pictures and detached water once without retiring borrowed art", () => {
  const owner = setup({ auto: false }),
    { layer } = owner,
    source = frame();
  owner.install();
  ask(owner, source);
  deliver(owner);
  publish(layer, layer.prepare());
  ask(owner, {
    ...source,
    water: [{ at: [1, 0, 0], level: 3, liquidVolumeM3: 1 }],
  });
  const task = layer.prepare();
  drain(task);
  const sprite = task.result.records.find(
    (record) => record.role === "water",
  ).display;
  let destroyed = 0;
  const original = sprite.destroy.bind(sprite);
  sprite.destroy = (...args) => {
    destroyed++;
    original(...args);
  };
  const meshes = task.prepareOrder(task.result.records);
  while (!meshes.advance({ records: 128, meshes: 2 })) {}
  layer.clear();
  assert.equal(task.status, "cancelled");
  assert.equal(destroyed, 1);
  assert.equal(layer.container.children.length, 0);
  assert.equal(layer.retainedRecords.records.length, 0);
  assert.equal(layer.coverage.cachedRegions, 0);
  assert.equal(layer.presentedTerrain, undefined);
  layer.dispose();
  layer.clear();
  layer.dispose();
  assert.equal(destroyed, 1);
  assert.equal(Texture.WHITE.destroyed, false);
});

test("absent terrain never hides actors on the shared world parent or overrides world visibility", () => {
  const owner = setup({ auto: false }),
    { layer } = owner,
    actor = new Sprite(Texture.WHITE);
  ask(owner, undefined);
  const task = layer.prepare();
  drain(task);
  assert.equal(task.result.terrainFrame, undefined);
  assert.equal(task.result.records.length, 0);
  const mesh = task.prepareOrder([
    { id: "actor", part: "body", display: actor },
  ]);
  while (!mesh.advance({ records: 8, meshes: 1 })) {}
  task.publish();
  assert.strictEqual(actor.parent, layer.container);
  assert.equal(layer.container.visible, true);
  layer.clear();
  assert.equal(layer.container.visible, true);
  assert.equal(actor.destroyed, false);
  layer.container.visible = false;
  ask(owner, undefined);
  publish(layer, layer.prepare());
  assert.equal(
    layer.container.visible,
    false,
    "terrain publication respects visibility owned by the world",
  );
  layer.dispose();
  actor.destroy();
});
