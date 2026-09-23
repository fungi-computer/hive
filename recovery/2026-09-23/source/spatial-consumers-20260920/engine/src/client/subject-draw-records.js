import { resolveWorldArtPlacement } from "./art-placement.js";
import { storeyBandFor, subjectSortFootprint } from "./draw-record-facts.js";
import { transformBakedPartPoint } from "./multipart-visual-owner.js";
import { worldVisualVolume, uprightTextureGeometry } from "./asset-draw-geometry.js";

function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`invalid subject draw ${name}`);
  return value;
}

function checkedAnchor(anchor) {
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))
    throw new Error("invalid subject draw anchor");
  return anchor;
}

function textureBounds(texture, anchor, screen) {
  if (!texture || !Number.isFinite(texture.width) || !Number.isFinite(texture.height))
    throw new Error("invalid subject draw texture");
  return Object.freeze({
    left: screen.x - anchor.x * texture.width,
    right: screen.x + (1 - anchor.x) * texture.width,
    top: screen.y - anchor.y * texture.height,
    bottom: screen.y + (1 - anchor.y) * texture.height,
  });
}

function longFootprint(resolvedPlacement, footprint) {
  if (resolvedPlacement?.kind === "stair") return true;
  if (resolvedPlacement?.kind !== "footprint" || footprint.length <= 1) return false;
  return new Set(footprint.map(point => point.x)).size === 1 ||
    new Set(footprint.map(point => point.z)).size === 1;
}

/**
 * Resolve one published subject into canonical world and screen geometry.
 * This owns no Pixi object and performs no ordering; callers retain visual
 * lifetime while every producer shares the same placement/footprint law.
 */
export function subjectDrawGeometry({
  subject,
  binding,
  texture,
  anchor,
  artPlacement,
  verticalMetres,
  project,
  hitArea,
  orderingMetadata,
  projection,
  cameraTurn = 0,
} = {}) {
  if (!subject || subject.id === undefined || subject.id === null)
    throw new Error("subject draw subject required");
  if (!binding || (binding.kind !== "figure" && binding.kind !== "static"))
    throw new Error("subject draw binding required");
  const checked = checkedAnchor(anchor);
  const originScreen = subject.screen;
  if (!originScreen || !Number.isFinite(originScreen.x) || !Number.isFinite(originScreen.y))
    throw new Error("subject draw screen point required");
  let resolvedPlacement;
  let offset = Object.freeze([0, 0]);
  let screenOffset = Object.freeze([0, 0]);
  if (binding.kind === "static" && subject.placement) {
    resolvedPlacement = resolveWorldArtPlacement({
      subjectPlacement: subject.placement,
      artPlacement,
      orientation: subject.placement.orientation,
      physicalFacing: ((Math.round(subject.facing ?? 0) % 4) + 4) % 4,
      cameraTurn,
    });
    offset = resolvedPlacement.offset;
    if (typeof project !== "function") throw new Error("subject draw projection required");
    const shifted = project(subject.x + offset[0], subject.y, subject.z + offset[1]);
    const base = project(subject.x, subject.y, subject.z);
    screenOffset = Object.freeze([
      finite(shifted.x - base.x, "screen offset x"),
      finite(shifted.y - base.y, "screen offset y"),
    ]);
  }
  const screen = Object.freeze({
    x: finite(originScreen.x + screenOffset[0], "screen x"),
    y: finite(originScreen.y + screenOffset[1], "screen y"),
  });
  const footprint = Object.freeze(subjectSortFootprint(subject, resolvedPlacement)
    .map(point => Object.freeze(point)));
  return Object.freeze({
    anchor: checked,
    screen,
    screenOffset,
    offset,
    resolvedPlacement,
    footprint,
    orderingKind: longFootprint(resolvedPlacement, footprint) ? "line" : "compact",
    storeyBand: storeyBandFor(subject, verticalMetres),
    screenBounds: textureBounds(texture, checked, screen),
    hitArea,
    ...(projection ? {
      orderGeometry: binding.kind === "figure" || binding.orderShape === "upright"
        ? uprightTextureGeometry(texture, checked, screen, subject, projection)
        : worldVisualVolume(orderingMetadata, { x: subject.x + offset[0], y: subject.y, z: subject.z + offset[1] }, cameraTurn),
      supportY: subject.y,
    } : {}),
  });
}

/** Build the ordinary one-sprite record without taking ownership of its display. */
export function ordinarySubjectDrawRecord({ subject, binding, geometry, display, sprite } = {}) {
  if (!geometry?.footprint?.length) throw new Error("subject draw geometry required");
  const isStatic = binding?.kind === "static";
  const attachment = isStatic
    ? Object.freeze({ kind: "footprint", points: geometry.footprint })
    : Object.freeze({ kind: "supported", support: subject.support ?? null, feet: geometry.footprint[0] });
  return Object.freeze({
    id: subject.id,
    role: isStatic ? (binding.worldRole === "floor" ? "floor" : "structure") : "actor",
    part: "body",
    renderPass: "opaque",
    attachment,
    relationPolicy: isStatic ? "structure" : "actor",
    orderingKind: geometry.orderingKind,
    pickable: subject.pickable !== false,
    display,
    moving: !isStatic,
    footprint: geometry.footprint,
    storeyBand: geometry.storeyBand,
    screenBounds: geometry.screenBounds,
    hitArea: geometry.hitArea,
    contains: point => geometry.hitArea?.contains(
      point.x - display.x - sprite.x,
      point.y - display.y - sprite.y,
    ) === true,
    visible: true,
    orderGeometry: geometry.orderGeometry,
    supportY: geometry.supportY,
  });
}

/** Add shared bounds/band facts before the multipart visual owner syncs sprites. */
export function multipartSubjectPartInputs({ parts, geometry } = {}) {
  if (!Array.isArray(parts) || !parts.length) throw new Error("subject draw parts required");
  return Object.freeze(parts.map(part => Object.freeze({
    ...part,
    screenBounds: textureBounds(part.texture, geometry.anchor, geometry.screen),
    storeyBand: geometry.storeyBand,
  })));
}

/** Decorate owner-produced sibling records with the ordinary world contract. */
export function multipartSubjectDrawRecords(records) {
  if (!Array.isArray(records)) throw new Error("subject draw multipart records required");
  return Object.freeze(records.map(record => Object.freeze({
    ...record,
    renderPass: "opaque",
    attachment: Object.freeze({
      kind: "part",
      owner: record.target ?? record.id,
      role: record.role,
      geometry: record.footprint,
    }),
    relationPolicy: "multipart-geometry",
    partRole: record.role,
    role: "structure",
    moving: false,
    contains: point => record.hitArea?.contains(
      point.x - record.display.x,
      point.y - record.display.y,
    ) === true,
  })));
}

/** Shared transform parameters consumed by the existing multipart owner. */
export function multipartSubjectSync({ subject, geometry, facing, pickable, hitAreaFor } = {}) {
  return Object.freeze({
    entityId: subject.id,
    anchor: geometry.anchor,
    screen: geometry.screen,
    scale: 1,
    transform: point => transformBakedPartPoint(point, facing, subject, geometry.offset),
    pickable: pickable !== false,
    hitAreaFor,
  });
}
