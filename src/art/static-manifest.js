export const STATIC_ART_SCHEMA = "goblin-static-art-v2";
export const STATIC_ART_BASE = "./generated-art/goblin-static-art-v2/";

export const STATIC_ART_LIMITS = Object.freeze({
  manifestBytes: 8 * 1024 * 1024,
  pngBytes: 16 * 1024 * 1024,
  pages: 8,
  pageSide: 2048,
  pagePixels: 8 * 2048 * 2048,
  textures: 2048,
  frameSide: 640,
  framePixels: 32 * 1024 * 1024,
  pathDepth: 8,
  sources: 128,
});

export const STATIC_ART_RENDER = Object.freeze({
  renderer: Object.freeze({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    pixelRatio: 1,
    clearColor: 0,
    clearAlpha: 0,
    outputColorSpace: "srgb",
  }),
  ground: Object.freeze({ width: 640, height: 400, cameraHeight: 1.03 }),
  portrait: Object.freeze({ width: 80, height: 80, cameraHeight: 1.03 }),
  prop: Object.freeze({ width: 112, height: 112, cameraHeight: 1.1 }),
  vehicle: Object.freeze({ width: 192, height: 160, cameraHeight: 1.08 }),
});

const SHA256 = /^[a-f0-9]{64}$/;
const FILE = /^[a-z0-9][a-z0-9._-]*\.png$/;
const SOURCE = /^(?:src|scripts)\/[A-Za-z0-9._/-]+$|^package-lock\.json$/;
// Texture paths preserve the original lower-camelCase art properties.
const KEY = /^(?:[a-z][A-Za-z0-9-]*|0|[1-9][0-9]{0,3})$/;
const INHERITED_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
const RESERVED_ROOTS = new Set([
  "ground",
  "pawnAnchor",
  "propAnchor",
  "bakeTerrain",
  "bakeTerrainWater",
  "bakeTerrainSlice",
  "dispose",
]);

function problem(at, detail) {
  throw new Error(`static-art-manifest-invalid:${at}:${detail}`);
}

function record(value, at) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    problem(at, "record-required");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length) problem(at, "symbol-key");
  for (const [key, descriptor] of Object.entries(descriptors))
    if (!descriptor.enumerable || descriptor.get || descriptor.set)
      problem(`${at}.${key}`, "plain-data-required");
  return value;
}

function keys(value, expected, at) {
  record(value, at);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    problem(at, "unexpected-fields");
  return value;
}

function array(value, at, { min = 0, max } = {}) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    problem(at, "array-required");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.getOwnPropertySymbols(value).length ||
    Object.getOwnPropertyNames(value).length !== value.length + 1 ||
    Object.keys(value).length !== value.length
  )
    problem(at, "plain-array-required");
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor?.enumerable || descriptor.get || descriptor.set)
      problem(`${at}[${index}]`, "plain-data-required");
  }
  if (value.length < min || (max !== undefined && value.length > max))
    problem(at, "array-size");
  return value;
}

function integer(value, at, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    problem(at, "integer-range");
  return value;
}

function finite(value, at, min, max) {
  if (!Number.isFinite(value) || value < min || value > max)
    problem(at, "number-range");
  return value;
}

function string(value, at, pattern, max = 256) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > max ||
    (pattern && !pattern.test(value))
  )
    problem(at, "string-format");
  return value;
}

function sha256(value, at) {
  return string(value, at, SHA256, 64);
}

function file(value, at) {
  return string(value, at, FILE, 96);
}

function anchor(value, at) {
  keys(value, ["x", "y"], at);
  return Object.freeze({
    x: finite(value.x, `${at}.x`, 0, 1),
    y: finite(value.y, `${at}.y`, 0, 1),
  });
}

function silhouette(value, width, height, at) {
  keys(value, ["rows", "spans"], at);
  const rows = array(value.rows, `${at}.rows`, {
    min: height + 1,
    max: height + 1,
  });
  const spans = array(value.spans, `${at}.spans`, {
    max: 2 * width * height,
  });
  if (spans.length % 2) problem(`${at}.spans`, "pairs-required");
  const checkedRows = rows.map((entry, index) =>
    integer(entry, `${at}.rows[${index}]`, 0, spans.length / 2),
  );
  if (checkedRows[0] !== 0 || checkedRows.at(-1) * 2 !== spans.length)
    problem(`${at}.rows`, "span-count");
  for (let row = 0; row < height; row++) {
    if (checkedRows[row] > checkedRows[row + 1])
      problem(`${at}.rows[${row}]`, "nonmonotonic");
    let previousEnd = -2;
    for (let pair = checkedRows[row]; pair < checkedRows[row + 1]; pair++) {
      const start = integer(
        spans[pair * 2],
        `${at}.spans[${pair * 2}]`,
        0,
        width - 1,
      );
      const end = integer(
        spans[pair * 2 + 1],
        `${at}.spans[${pair * 2 + 1}]`,
        start,
        width - 1,
      );
      if (start <= previousEnd + 1)
        problem(`${at}.spans[${pair * 2}]`, "overlap-or-adjacency");
      previousEnd = end;
    }
  }
  return Object.freeze({
    rows: Object.freeze([...checkedRows]),
    spans: Object.freeze(
      spans.map((entry, index) =>
        integer(entry, `${at}.spans[${index}]`, 0, width - 1),
      ),
    ),
  });
}

function image(value, at, { exactFile = null, exactSize = null } = {}) {
  keys(value, ["file", "sha256", "width", "height", "silhouette"], at);
  const checkedFile = file(value.file, `${at}.file`);
  if (exactFile && checkedFile !== exactFile)
    problem(`${at}.file`, "unexpected-file");
  const width = integer(
    value.width,
    `${at}.width`,
    1,
    STATIC_ART_LIMITS.frameSide,
  );
  const height = integer(
    value.height,
    `${at}.height`,
    1,
    STATIC_ART_LIMITS.frameSide,
  );
  if (exactSize && (width !== exactSize.width || height !== exactSize.height))
    problem(at, "unexpected-size");
  return Object.freeze({
    file: checkedFile,
    sha256: sha256(value.sha256, `${at}.sha256`),
    width,
    height,
    silhouette: silhouette(value.silhouette, width, height, `${at}.silhouette`),
  });
}

function page(value, index) {
  const at = `pages[${index}]`;
  keys(value, ["id", "file", "sha256", "width", "height"], at);
  return Object.freeze({
    id: string(value.id, `${at}.id`, /^atlas-[0-7]$/, 16),
    file: file(value.file, `${at}.file`),
    sha256: sha256(value.sha256, `${at}.sha256`),
    width: integer(value.width, `${at}.width`, 1, STATIC_ART_LIMITS.pageSide),
    height: integer(
      value.height,
      `${at}.height`,
      1,
      STATIC_ART_LIMITS.pageSide,
    ),
  });
}

function path(value, at) {
  const result = array(value, at, {
    min: 2,
    max: STATIC_ART_LIMITS.pathDepth,
  }).map((segment, index) => {
    if (Number.isSafeInteger(segment))
      return integer(
        segment,
        `${at}[${index}]`,
        0,
        STATIC_ART_LIMITS.textures - 1,
      );
    const checked = string(segment, `${at}[${index}]`, KEY, 64);
    if (INHERITED_KEYS.has(checked))
      problem(`${at}[${index}]`, "inherited-key");
    return checked;
  });
  if (typeof result[0] !== "string" || RESERVED_ROOTS.has(result[0]))
    problem(`${at}[0]`, "reserved-root");
  return Object.freeze(result);
}

function entry(value, index, pages) {
  const at = `entries[${index}]`;
  keys(value, ["path", "page", "x", "y", "width", "height", "silhouette"], at);
  const pageId = string(value.page, `${at}.page`, /^atlas-[0-7]$/, 16);
  const owner = pages.get(pageId);
  if (!owner) problem(`${at}.page`, "unknown-page");
  const width = integer(
    value.width,
    `${at}.width`,
    1,
    STATIC_ART_LIMITS.frameSide,
  );
  const height = integer(
    value.height,
    `${at}.height`,
    1,
    STATIC_ART_LIMITS.frameSide,
  );
  const x = integer(value.x, `${at}.x`, 0, owner.width - width);
  const y = integer(value.y, `${at}.y`, 0, owner.height - height);
  return Object.freeze({
    path: path(value.path, `${at}.path`),
    page: pageId,
    x,
    y,
    width,
    height,
    silhouette: silhouette(value.silhouette, width, height, `${at}.silhouette`),
  });
}

function renderer(value) {
  const expected = STATIC_ART_RENDER.renderer;
  keys(value, Object.keys(expected), "provenance.renderer");
  const result = {};
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue)
      problem(`provenance.renderer.${key}`, "unexpected-setting");
    result[key] = expectedValue;
  }
  return Object.freeze(result);
}

function sources(value) {
  const seen = new Set();
  return Object.freeze(
    array(value, "provenance.sources", {
      min: 1,
      max: STATIC_ART_LIMITS.sources,
    }).map((source, index) => {
      const at = `provenance.sources[${index}]`;
      keys(source, ["path", "sha256"], at);
      const sourcePath = string(source.path, `${at}.path`, SOURCE, 192);
      if (sourcePath.includes("..") || seen.has(sourcePath))
        problem(`${at}.path`, "duplicate-or-parent");
      seen.add(sourcePath);
      return Object.freeze({
        path: sourcePath,
        sha256: sha256(source.sha256, `${at}.sha256`),
      });
    }),
  );
}

function provenance(value) {
  keys(value, ["threeRevision", "renderer", "sources"], "provenance");
  return Object.freeze({
    threeRevision: string(
      value.threeRevision,
      "provenance.threeRevision",
      /^\d+$/,
      8,
    ),
    renderer: renderer(value.renderer),
    sources: sources(value.sources),
  });
}

function overlapping(left, right) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function pathNode() {
  return { kind: null, leaf: false, children: new Map() };
}

function insertPath(root, path) {
  let node = root;
  for (const segment of path) {
    if (node.leaf) problem("entries", "path-prefix-conflict");
    const kind = typeof segment === "number" ? "array" : "record";
    if (node.kind && node.kind !== kind)
      problem("entries", "container-kind-conflict");
    node.kind = kind;
    if (!node.children.has(segment)) node.children.set(segment, pathNode());
    node = node.children.get(segment);
  }
  if (node.leaf) problem("entries", "duplicate-path");
  if (node.children.size) problem("entries", "path-prefix-conflict");
  node.leaf = true;
}

function validatePathTree(node) {
  if (node.kind === "array") {
    const indexes = [...node.children.keys()];
    if (indexes.length !== Math.max(...indexes) + 1)
      problem("entries", "sparse-array-path");
  }
  for (const child of node.children.values()) validatePathTree(child);
}

function validatePaths(entries) {
  const root = pathNode();
  for (const entry of entries) insertPath(root, entry.path);
  validatePathTree(root);
}

function validatePageFrames(entries, pages) {
  const byPage = new Map([...pages.keys()].map((id) => [id, []]));
  for (const entry of entries) byPage.get(entry.page).push(entry);
  for (const [pageId, placed] of byPage) {
    if (!placed.length) problem(`pages.${pageId}`, "unused-page");
    for (let left = 0; left < placed.length; left++)
      for (let right = left + 1; right < placed.length; right++)
        if (overlapping(placed[left], placed[right]))
          problem(`pages.${pageId}`, "overlapping-frames");
  }
}

export function parseStaticArtManifest(input) {
  keys(
    input,
    [
      "schema",
      "textureCount",
      "anchors",
      "ground",
      "pages",
      "entries",
      "provenance",
    ],
    "manifest",
  );
  if (input.schema !== STATIC_ART_SCHEMA) problem("schema", "unsupported");
  keys(input.anchors, ["pawn", "prop", "vehicle"], "anchors");
  const checkedPages = array(input.pages, "pages", {
    min: 1,
    max: STATIC_ART_LIMITS.pages,
  }).map(page);
  const pageIds = new Map();
  const pageFiles = new Set(["ground.png"]);
  let pagePixels = 0;
  for (const current of checkedPages) {
    if (pageIds.has(current.id) || pageFiles.has(current.file))
      problem("pages", "duplicate-id-or-file");
    pageIds.set(current.id, current);
    pageFiles.add(current.file);
    pagePixels += current.width * current.height;
  }
  if (pagePixels > STATIC_ART_LIMITS.pagePixels)
    problem("pages", "pixel-budget");
  const checkedEntries = array(input.entries, "entries", {
    min: 1,
    max: STATIC_ART_LIMITS.textures - 1,
  }).map((value, index) => entry(value, index, pageIds));
  const textureCount = integer(
    input.textureCount,
    "textureCount",
    2,
    STATIC_ART_LIMITS.textures,
  );
  if (textureCount !== checkedEntries.length + 1)
    problem("textureCount", "entry-count");
  const framePixels = checkedEntries.reduce(
    (total, current) => total + current.width * current.height,
    640 * 400,
  );
  if (framePixels > STATIC_ART_LIMITS.framePixels)
    problem("entries", "pixel-budget");
  validatePaths(checkedEntries);
  validatePageFrames(checkedEntries, pageIds);
  return Object.freeze({
    schema: STATIC_ART_SCHEMA,
    textureCount,
    anchors: Object.freeze({
      pawn: anchor(input.anchors.pawn, "anchors.pawn"),
      prop: anchor(input.anchors.prop, "anchors.prop"),
      vehicle: anchor(input.anchors.vehicle, "anchors.vehicle"),
    }),
    ground: image(input.ground, "ground", {
      exactFile: "ground.png",
      exactSize: STATIC_ART_RENDER.ground,
    }),
    pages: Object.freeze(checkedPages),
    entries: Object.freeze(checkedEntries),
    provenance: provenance(input.provenance),
  });
}

export function serializeSilhouette(value) {
  return {
    rows: [...value.rows],
    spans: [...value.spans],
  };
}

/** Add byte identities and source provenance to a browser-produced draft. */
export function completeStaticArtManifest(draft, fileSha256, sources) {
  const hashes = record(fileSha256, "fileSha256");
  const manifest = {
    schema: STATIC_ART_SCHEMA,
    textureCount: draft.textureCount,
    anchors: draft.anchors,
    ground: {
      ...draft.ground,
      sha256: hashes[draft.ground.file],
    },
    pages: draft.pages.map((page) => ({
      ...page,
      sha256: hashes[page.file],
    })),
    entries: draft.entries,
    provenance: {
      ...draft.provenance,
      sources,
    },
  };
  return parseStaticArtManifest(manifest);
}
