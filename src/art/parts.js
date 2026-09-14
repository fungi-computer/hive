/**
 * Declarative presentation parts.  A part is a render fragment of one
 * physical owner; it does not own placement, occupancy, selection or state.
 */
export const STATIC_PART_ROLES = Object.freeze([
  "supporting-surface",
  "upright-boundary",
  "footprint-object",
]);

const ROLE_SET = new Set(STATIC_PART_ROLES);

function fail(at, detail) {
  throw new Error(`static-art-part-invalid:${at}:${detail}`);
}

function number(value, at) {
  if (!Number.isFinite(value)) fail(at, "finite-required");
  return value;
}

function point(value, at) {
  if (!Array.isArray(value) || value.length !== 3)
    fail(at, "point-required");
  return Object.freeze(value.map((entry, index) => number(entry, `${at}[${index}]`)));
}

/** Validate and detach a local support/ordering geometry declaration. */
export function parsePartGeometry(value, at = "geometry") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(at, "record-required");
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "footprint,maxY,minY") fail(at, "unexpected-fields");
  if (!Array.isArray(value.footprint) || value.footprint.length < 1)
    fail(`${at}.footprint`, "points-required");
  const footprint = Object.freeze(value.footprint.map((entry, index) => point(entry, `${at}.footprint[${index}]`)));
  const minY = number(value.minY, `${at}.minY`), maxY = number(value.maxY, `${at}.maxY`);
  if (maxY < minY) fail(at, "inverted-height");
  for (const [index, entry] of footprint.entries())
    if (entry[1] < minY || entry[1] > maxY) fail(`${at}.footprint[${index}]`, "outside-height");
  return Object.freeze({ footprint, minY, maxY });
}

/** Validate a source-side part declaration while retaining its mesh group. */
export function defineStaticPart({ id, role, geometry, group, modelSide } = {}) {
  if (typeof id !== "string" || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id))
    fail("id", "format");
  if (!ROLE_SET.has(role)) fail("role", "unsupported");
  if (group === undefined || group === null) fail("group", "required");
  const result = { id, role, geometry: parsePartGeometry(geometry) , group };
  if (modelSide !== undefined) {
    if (modelSide !== "left" && modelSide !== "right") fail("modelSide", "unsupported");
    result.modelSide = modelSide;
  }
  return Object.freeze(result);
}

/**
 * Attach a checked immutable declaration to an authoring scene.  The mesh
 * groups remain ordinary Three groups, so the existing bake and disposal
 * lifecycle owns their geometry.
 */
export function declareStaticParts(scene, parts) {
  if (!scene || !Array.isArray(parts) || parts.length < 1)
    fail("parts", "nonempty-required");
  const checked = parts.map((part, index) => defineStaticPart(part, `parts[${index}]`));
  const ids = new Set();
  for (const part of checked) {
    if (ids.has(part.id)) fail("parts", "duplicate-id");
    ids.add(part.id);
  }
  scene.userData.staticParts = checked;
  return checked;
}

export function partOwnerKey(path) {
  if (!Array.isArray(path) || path.length === 0) fail("owner", "path-required");
  return JSON.stringify(path);
}

/** Stable exact RGB IDs for the export-only frontmost ownership pass. */
export function partIdCodes(parts) {
  if (!Array.isArray(parts) || parts.length < 1) fail("ids", "parts-required");
  const ids = parts.map((part) => typeof part === "string" ? part : part?.id);
  if (ids.some((id) => typeof id !== "string" || !id)) fail("ids", "id-required");
  if (new Set(ids).size !== ids.length) fail("ids", "duplicate-id");
  return Object.freeze([...ids].sort().map((id, index) => Object.freeze({ id, code: index + 1 })));
}

/**
 * Render a depth-resolved ID pass using the same scene/camera as the color
 * bake. This function is export-only: materials are restored before return,
 * temporary ID materials are disposed, and no ID buffer reaches the client.
 */
export function renderPartIdPass(renderer, source, camera, width, height, declarations, { createMaterial = (code) => renderer.createPartIdMaterial?.(code), setMaterialColor = (material, red, green, blue) => material?.color?.setRGB?.(red, green, blue) } = {}) {
  const codes = partIdCodes(declarations);
  const codeById = new Map(codes.map((entry) => [entry.id, entry.code]));
  const groupById = new Map(declarations.map((entry) => [entry.id, entry.group]));
  const materials = new Map(codes.map(({ id, code }) => {
    const material = createMaterial(code, id);
    const red = (code & 0xff) / 255, green = ((code >> 8) & 0xff) / 255, blue = ((code >> 16) & 0xff) / 255;
    setMaterialColor(material, red, green, blue);
    return [id, material];
  }));
  const makeMaterial = (id) => materials.get(id);
  const saved = [];
  const savedVisibility = [];
  source.traverse((object) => {
    if (typeof object.visible === "boolean") savedVisibility.push({ object, visible: object.visible });
  });
  const autoClear = renderer.autoClear;
  const sizeTarget = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
  const size = renderer.getSize?.(sizeTarget);
  try {
    for (const { group } of declarations) group.traverse?.((object) => { object.visible = true; });
    renderer.autoClear = true;
    if (renderer.setSize) renderer.setSize(width, height, false);
    source.traverse((object) => {
      if (!object.isMesh) return;
      let owner;
      for (const [id, group] of groupById) if (group === object || group?.getObjectById?.(object.id)) { owner = id; break; }
      if (!owner) {
        let current = object.parent;
        while (current && !owner) { for (const [id, group] of groupById) if (current === group) owner = id; current = current.parent; }
      }
      saved.push({ object, material: object.material, visible: object.visible });
      object.visible = Boolean(owner);
      if (owner) object.material = makeMaterial(owner);
    });
    source.traverse((object) => { if (object.isGroup && groupById.has(object.userData?.partId)) object.visible = true; });
    renderer.render(source, camera);
    const gl = renderer.getContext();
    const raw = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const pixels = new Uint32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const from = ((height - y - 1) * width + x) * 4;
      pixels[y * width + x] = raw[from] | (raw[from + 1] << 8) | (raw[from + 2] << 16);
    }
    return Object.freeze({ width, height, pixels, codes });
  } finally {
    for (const { object, material, visible } of saved) { object.material = material; object.visible = visible; }
    for (const { object, visible } of savedVisibility) object.visible = visible;
    renderer.autoClear = autoClear;
    for (const material of materials.values()) material?.dispose?.();
    if (size && renderer.setSize) renderer.setSize(size.x, size.y, false);
  }
}

/**
 * Assign original composite pixels to the frontmost part IDs. `partIds` is
 * the result of the depth pass, so declaration order cannot affect ownership.
 * This is an exporter utility: the runtime receives ordinary RGBA textures.
 */
export function partitionCompositePixels({ width, height, composite, partIds, parts, partCodes, stats = null } = {}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    fail("pixels", "dimensions");
  if (!(composite instanceof Uint8ClampedArray) || composite.length !== width * height * 4)
    fail("pixels.composite", "rgba-required");
  if (!(partIds instanceof Uint32Array) || partIds.length !== width * height) fail("pixels.partIds", "id-buffer-required");
  const descriptors = Array.isArray(parts) ? parts : [];
  const codes = partCodes ?? partIdCodes(descriptors);
  if (!descriptors.length || codes.length !== descriptors.length) fail("pixels.parts", "parts-required");
  if (new Set(codes.map(({ id }) => id)).size !== codes.length || new Set(codes.map(({ code }) => code)).size !== codes.length)
    fail("pixels.parts", "duplicate-id");
  const byCode = new Map(codes.map(({ id, code }) => [code, descriptors.findIndex((part) => (typeof part === "string" ? part : part.id) === id)]));
  if ([...byCode.values()].some((index) => index < 0)) fail("pixels.parts", "unknown-id");
  const output = descriptors.map(() => new Uint8ClampedArray(composite.length));
  const owner = new Int32Array(width * height);
  owner.fill(-1);
  for (let pixel = 0; pixel < owner.length; pixel++) {
    const code = partIds[pixel];
    if (code === 0) continue;
    const index = byCode.get(code);
    if (index === undefined) fail(`pixels[${pixel}]`, "unknown-id");
    owner[pixel] = index;
  }
  // Multi-source 8-neighbor propagation assigns each pixel to a nearest
  // frontmost seed in linear time. Seeds enter in pixel/semantic-code order,
  // making equal-distance ties deterministic and declaration-order independent.
  const queue = new Int32Array(owner.length);
  let head = 0, tail = 0, operations = 0, seeded = 0;
  for (let pixel = 0; pixel < owner.length; pixel++) if (owner[pixel] >= 0) { queue[tail++] = pixel; seeded++; }
  if (!seeded && composite.some((value, index) => index % 4 === 3 && value > 0)) fail("pixels", "no-visible-owner");
  const directions = [-1, 0, 1];
  while (head < tail) {
    const pixel = queue[head++], source = owner[pixel];
    const x = pixel % width, y = Math.floor(pixel / width);
    for (const dy of directions) for (const dx of directions) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      operations++;
      const neighbor = ny * width + nx;
      if (owner[neighbor] >= 0) continue;
      owner[neighbor] = source;
      queue[tail++] = neighbor;
    }
  }
  if (stats && typeof stats === "object") Object.assign(stats, { seeded, visited: tail, operations });
  for (let pixel = 0; pixel < owner.length; pixel++) {
    const index = owner[pixel];
    if (index < 0) continue;
    output[index].set(composite.subarray(pixel * 4, pixel * 4 + 4), pixel * 4);
  }
  return Object.freeze(output);
}
