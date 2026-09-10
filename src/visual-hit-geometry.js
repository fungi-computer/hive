import { Container, Graphics, Text } from "pixi.js";

const textureSilhouettes = new WeakMap();
const textureHitAreas = new WeakMap();
const MAX_DEBUG_TARGETS = 256;

export function createVisibleSilhouette(rgba, width, height) {
  const rows = new Uint32Array(height + 1),
    spans = [];
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      while (x < width && rgba[(y * width + x) * 4 + 3] === 0) x++;
      if (x === width) break;
      const start = x;
      while (x < width && rgba[(y * width + x) * 4 + 3] !== 0) x++;
      spans.push(start, x - 1);
    }
    rows[y + 1] = spans.length / 2;
  }
  return { width, height, rows, spans: Uint16Array.from(spans) };
}

export function registerVisibleTexture(texture, rgba, width, height) {
  const silhouette = createVisibleSilhouette(rgba, width, height);
  return registerVisibleSilhouette(texture, silhouette);
}

function checkedSilhouetteInput(input) {
  const width = input?.width,
    height = input?.height,
    sourceRows = input?.rows,
    sourceSpans = input?.spans;
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    width > 65535 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    height > 65535 ||
    !sourceRows ||
    !sourceSpans ||
    sourceRows.length !== height + 1 ||
    sourceSpans.length % 2 ||
    sourceSpans.length > 2 * width * height
  )
    throw new Error("Invalid visible texture silhouette");
  for (const value of sourceRows)
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > sourceSpans.length / 2
    )
      throw new Error("Invalid visible texture silhouette");
  for (const value of sourceSpans)
    if (!Number.isSafeInteger(value) || value < 0 || value >= width)
      throw new Error("Invalid visible texture silhouette");
  return { width, height, sourceRows, sourceSpans };
}

function validateSilhouetteRelations({
  width,
  height,
  sourceRows,
  sourceSpans,
}) {
  if (sourceRows[0] !== 0 || sourceRows[height] * 2 !== sourceSpans.length)
    throw new Error("Invalid visible texture silhouette");
  for (let y = 0; y < height; y++) {
    if (sourceRows[y] > sourceRows[y + 1])
      throw new Error("Invalid visible texture silhouette");
    let priorEnd = -2;
    for (let pair = sourceRows[y]; pair < sourceRows[y + 1]; pair++) {
      const start = sourceSpans[pair * 2],
        end = sourceSpans[pair * 2 + 1];
      if (start <= priorEnd + 1 || end < start || end >= width)
        throw new Error("Invalid visible texture silhouette");
      priorEnd = end;
    }
  }
}

/** Register checked, detached CPU picking data loaded beside a static texture. */
export function registerVisibleSilhouette(texture, input) {
  const checked = checkedSilhouetteInput(input);
  validateSilhouetteRelations(checked);
  const { width, height, sourceRows, sourceSpans } = checked;
  const rows = Uint32Array.from(sourceRows),
    spans = Uint16Array.from(sourceSpans);
  const silhouette = { width, height, rows, spans };
  textureSilhouettes.set(texture, silhouette);
  return silhouette;
}

/** Detached serialization input for the maintained static-art exporter. */
export function snapshotVisibleSilhouette(texture) {
  const silhouette = textureSilhouettes.get(texture);
  if (!silhouette) throw new Error("Missing baked texture silhouette");
  return {
    width: silhouette.width,
    height: silhouette.height,
    rows: [...silhouette.rows],
    spans: [...silhouette.spans],
  };
}

export function createVisibleHitArea(silhouette, anchorPoint) {
  const anchor = { x: anchorPoint.x, y: anchorPoint.y };
  const bounds = {
    x: -anchor.x * silhouette.width,
    y: -anchor.y * silhouette.height,
    width: silhouette.width,
    height: silhouette.height,
  };
  return {
    kind: "visible-silhouette",
    silhouette,
    anchor,
    bounds,
    contains(localX, localY) {
      const x = Math.floor(localX + anchor.x * silhouette.width),
        y = Math.floor(localY + anchor.y * silhouette.height);
      if (x < 0 || y < 0 || x >= silhouette.width || y >= silhouette.height)
        return false;
      const start = silhouette.rows[y] * 2,
        end = silhouette.rows[y + 1] * 2;
      for (let i = start; i < end; i += 2)
        if (x >= silhouette.spans[i] && x <= silhouette.spans[i + 1])
          return true;
      return false;
    },
  };
}

export function visibleHitAreaFor(texture, anchorPoint) {
  const silhouette = textureSilhouettes.get(texture);
  if (!silhouette) throw new Error("Missing baked texture silhouette");
  let byAnchor = textureHitAreas.get(texture);
  if (!byAnchor) textureHitAreas.set(texture, (byAnchor = new Map()));
  const key = `${anchorPoint.x}:${anchorPoint.y}`;
  let hitArea = byAnchor.get(key);
  if (!hitArea) {
    hitArea = createVisibleHitArea(silhouette, anchorPoint);
    byAnchor.set(key, hitArea);
  }
  return hitArea;
}

function sameTarget(left, right) {
  return (
    left.kind === right.kind &&
    left.id === right.id &&
    left.level === right.level &&
    left.action === right.action
  );
}

export function debugPrimitives(record) {
  const { silhouette, anchor, bounds } = record.hitArea;
  const rows = [];
  for (let y = 0; y < silhouette.height; y++) {
    const start = silhouette.rows[y] * 2,
      end = silhouette.rows[y + 1] * 2;
    for (let i = start; i < end; i += 2)
      rows.push({
        x: silhouette.spans[i] - anchor.x * silhouette.width,
        y: y - anchor.y * silhouette.height,
        width: silhouette.spans[i + 1] - silhouette.spans[i] + 1,
        height: 1,
      });
  }
  return {
    rows,
    bounds: { ...bounds },
    origin: { x: 0, y: 0 },
    label: `${record.target.action} → ${record.target.kind}:${record.target.id} · L${record.target.level} · ${record.orientation}`,
  };
}

function drawDebug(entry, record) {
  const debug = record.debug;
  entry.graphics.clear();
  for (const row of debug.rows)
    entry.graphics.rect(row.x, row.y, row.width, row.height);
  entry.graphics.fill({ color: 0x66e3ff, alpha: 0.18 });
  entry.graphics
    .rect(
      debug.bounds.x,
      debug.bounds.y,
      debug.bounds.width,
      debug.bounds.height,
    )
    .stroke({ color: 0xffc857, width: 0.75, alpha: 0.9 });
  entry.graphics
    .moveTo(-3, 0)
    .lineTo(3, 0)
    .moveTo(0, -3)
    .lineTo(0, 3)
    .stroke({ color: 0xff6b8a, width: 1 });
  entry.label.text = debug.label;
  entry.label.position.set(debug.bounds.x, debug.bounds.y - 7);
  entry.debug = debug;
  entry.revision = record.revision;
}

function makeDebugEntry() {
  const container = new Container(),
    graphics = new Graphics(),
    label = new Text({
      text: "",
      style: {
        fontFamily: "ui-monospace, monospace",
        fontSize: 6,
        fill: 0xfff0bd,
        stroke: { color: 0x17261d, width: 2 },
      },
    });
  container.eventMode = graphics.eventMode = label.eventMode = "none";
  container.addChild(graphics, label);
  return { container, graphics, label, debug: null, revision: -1 };
}

export function createVisualHitGeometryOwner(parent = null) {
  const records = new Map(),
    entries = new Map();
  const layer = parent ? new Container() : null;
  if (layer) {
    layer.eventMode = "none";
    layer.visible = false;
    layer.zIndex = 1_000_000;
    parent.addChild(layer);
  }
  let revision = 0;

  function bind(display, { texture, anchor, orientation, target }) {
    const current = records.get(display);
    if (
      current?.texture === texture &&
      current.orientation === orientation &&
      current.anchor.x === anchor.x &&
      current.anchor.y === anchor.y &&
      sameTarget(current.target, target)
    )
      return current;
    const hitArea = visibleHitAreaFor(texture, anchor);
    const record = {
      display,
      texture,
      orientation,
      anchor: { x: anchor.x, y: anchor.y },
      target: { ...target },
      hitArea,
      revision: ++revision,
    };
    record.debug = debugPrimitives(record);
    display.hitArea = hitArea;
    records.set(display, record);
    return record;
  }

  function remove(display) {
    records.delete(display);
    const entry = entries.get(display);
    if (entry) {
      entry.container.destroy({ children: true });
      entries.delete(display);
    }
  }

  function renderDebug(enabled) {
    if (!layer) return;
    layer.visible = enabled;
    if (!enabled) return;
    let shown = 0;
    for (const [display, record] of records) {
      let entry = entries.get(display);
      const active =
        shown < MAX_DEBUG_TARGETS &&
        display.visible &&
        display.renderable !== false &&
        display.eventMode !== "none";
      if (!active) {
        if (entry) entry.container.visible = false;
        continue;
      }
      if (!entry) {
        if (entries.size >= MAX_DEBUG_TARGETS) continue;
        entry = makeDebugEntry();
        entries.set(display, entry);
        layer.addChild(entry.container);
      }
      entry.container.visible = true;
      shown++;
      entry.container.position.set(display.position.x, display.position.y);
      entry.container.scale.set(display.scale.x, display.scale.y);
      entry.container.pivot.set(display.pivot.x, display.pivot.y);
      entry.container.skew.set(display.skew.x, display.skew.y);
      entry.container.rotation = display.rotation;
      if (entry.revision !== record.revision) drawDebug(entry, record);
    }
  }

  return {
    bind,
    remove,
    renderDebug,
    recordFor: (display) => records.get(display) ?? null,
    debugFor: (display) => entries.get(display)?.debug ?? null,
    records: () => [...records.values()],
    layer,
  };
}
