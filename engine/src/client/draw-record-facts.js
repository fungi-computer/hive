/** Identity and placement facts shared by drawing consumers. This module owns
 * no depth comparison or ordering algorithm. */
export function stableKey(record) {
  return `${String(record.id)}\u0000${String(record.part ?? "body")}`;
}

/** Query support surfaces in the already accepted front-to-back order.
 * Geometry admission is separate from alpha picking: a deck's transparent
 * art can still expose its declared walkable surface. */
export function surfaceSubjectFromOrdered(order, subjects, pointValue, resolveSurface) {
  if (!(Array.isArray(order) || order?.leaves) || !Array.isArray(subjects) || !pointValue || typeof resolveSurface !== "function") return null;
  const byId = new Map(subjects.filter(subject => subject?.id !== undefined && subject?.id !== null)
    .map(subject => [String(subject.id), subject]));
  for (const node of reverseOrderedRecords(order)) {
    if (node?.visible === false || node?.pickable === false) continue;
    const subject = byId.get(String(node?.target ?? node?.id));
    if (!subject || subject.pickable === false || !subject.surface) continue;
    const surface = resolveSurface(pointValue.x, pointValue.y, subject);
    if (surface) return { node, subject, surface };
  }
  return null;
}

export function storeyBandFor(subject, verticalMetres) {
  const explicit = subject?.support?.level ?? subject?.surface?.level;
  if (Number.isFinite(explicit)) return explicit;
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0)
    throw new Error("subject storey conversion requires positive vertical metres");
  return Math.floor(subject.y / verticalMetres);
}

/** Translate canonical art placement datums into the subject's world origin. */
export function subjectSortFootprint(subject, resolvedPlacement) {
  const origin = { x: subject.x, y: subject.y, z: subject.z };
  if (resolvedPlacement?.kind === "footprint" && resolvedPlacement.alignedFootprint?.length)
    return resolvedPlacement.alignedFootprint.map(([x, z]) => ({ x: origin.x + x, y: origin.y, z: origin.z + z }));
  if (resolvedPlacement?.kind === "stair" && resolvedPlacement.entrance && resolvedPlacement.landing)
    return [resolvedPlacement.entrance, resolvedPlacement.landing].map(([x, y, z]) => ({ x: origin.x + x, y: origin.y + y, z: origin.z + z }));
  if (resolvedPlacement?.kind === "edge" && resolvedPlacement.endpoints?.length)
    return resolvedPlacement.endpoints.map(([x, z]) => ({ x: origin.x + x, y: origin.y, z: origin.z + z }));
  return [origin];
}
import { reverseOrderedRecords } from "./retained-paint-order.js";

