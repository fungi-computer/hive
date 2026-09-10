const ANCHORS = new Set(["propAnchor", "vehicleAnchor"]);
const INHERITED = new Set(Object.getOwnPropertyNames(Object.prototype));

function checkedPath(path) {
  if (!Array.isArray(path) || path.length === 0)
    throw new Error("static visual path must be nonempty");
  for (const segment of path) {
    if (
      !(typeof segment === "string" && segment.length > 0) &&
      !(Number.isSafeInteger(segment) && segment >= 0)
    )
      throw new Error("static visual path contains an invalid segment");
    if (typeof segment === "string" && INHERITED.has(segment))
      throw new Error("static visual path contains an inherited segment");
  }
  return path;
}

/** Resolve one checked static art binding without per-kind renderer branches. */
export function resolveStaticVisual(art, binding, facing = 0) {
  if (!binding || binding.kind !== "static")
    throw new Error("static visual binding required");
  const path = checkedPath(binding.path);
  if (typeof binding.facing !== "boolean" || !ANCHORS.has(binding.anchor))
    throw new Error("static visual binding has invalid facing or anchor");
  if (!Number.isSafeInteger(facing) || facing < 0 || facing > 3)
    throw new Error("static visual facing must be 0 through 3");
  const resolvedPath = binding.facing ? [...path, facing] : path;
  let value = art;
  for (const segment of resolvedPath) {
    if (value === null || value === undefined || !Object.prototype.hasOwnProperty.call(value, segment))
      return undefined;
    value = value[segment];
  }
  return { texture: value, anchor: art?.[binding.anchor], path: resolvedPath };
}
