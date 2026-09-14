import { rotatePlacementPoint } from "./art-placement.js";

/** Resolve an ordered structure sprite to its canonical physical support face. */
export function structureSurfaceFromSprite(node, subject, point, displayed, project) {
  if (!(node?.target ?? node?.id) || node.role !== "structure" || !subject?.placement || !displayed?.structureSurfaces || !Number.isFinite(displayed.verticalMetres)) return null;
  if (subject.placement.kind === "edge") return null;
  const supportLevel = Math.round(subject.y / displayed.verticalMetres - 0.5);
  const localCells = subject.placement.kind === "footprint"
    ? subject.placement.footprint.map(([x, z]) => ({ x, z, level: supportLevel }))
    : (() => {
      const direction = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }[subject.placement.orientation];
      const run = Math.max(Math.abs(subject.placement.landing[0] - subject.placement.entrance[0]), Math.abs(subject.placement.landing[2] - subject.placement.entrance[2]));
      const rise = Math.abs(subject.placement.landing[1] - subject.placement.entrance[1]) / displayed.verticalMetres;
      return Array.from({ length: Math.max(0, Math.round(run)) }, (_, index) => ({
        x: direction[0] * (index + 1), z: direction[1] * (index + 1),
        level: supportLevel + Math.floor((index + 1) * rise / run),
      }));
    })();
  const cells = localCells.map(({ x, z, level }) => {
    const rotated = subject.placement.kind === "footprint" ? rotatePlacementPoint([x, z], subject.placement.orientation) : [x, z];
    return [Math.round(subject.x + rotated[0]), level, Math.round(subject.z + rotated[1])];
  });
  const surfaces = cells.flatMap(cell => displayed.structureSurfaces.filter(surface => surface.cell.every((value, index) => value === cell[index])));
  if (!surfaces.length) return null;
  return surfaces.map(surface => {
    const [x, y, z] = surface.cell;
    const projected = project(x, (y + 0.5) * displayed.verticalMetres, z);
    return { surface, distance: (projected.x - point.x) ** 2 + (projected.y - point.y) ** 2 };
  }).sort((left, right) => left.distance - right.distance || left.surface.cell.join(",").localeCompare(right.surface.cell.join(",")))[0].surface;
}

/**
 * Pick the foremost alpha hit that resolves to a canonical structure surface.
 * `orderedSprites` is the final sorter order (back to front), so walking it
 * backwards preserves the same visual precedence while allowing actors,
 * trees, and other static props to fall through.
 */
export function structureSurfaceFromOrderedSprites(orderedSprites, subjects, hitPoint, projectedPoint, displayed, project) {
  const byId = subjects instanceof Map
    ? subjects
    : new Map((subjects ?? []).filter(subject => subject?.id !== undefined).map(subject => [subject.id, subject]));
  for (let index = (orderedSprites?.length ?? 0) - 1; index >= 0; index -= 1) {
    const node = orderedSprites[index];
    if (node?.visible === false || node?.role !== "structure" || node.contains?.(hitPoint) !== true) continue;
    const surface = structureSurfaceFromSprite(node, byId.get(node.target ?? node.id), projectedPoint, displayed, project);
    if (surface) return surface;
  }
  return null;
}

/** Pure helpers for the shared, retained-style construction tool. */
export function buildControls(controls) {
  const groups = new Map();
  for (const control of controls ?? []) {
    if (control.command !== "build" || !["world-surface", "world-edge"].includes(control.target)) continue;
    const input = control.input;
    const catalog = input && typeof input.catalog === "string" ? input.catalog : null;
    if (!catalog) continue;
    const group = groups.get(catalog) ?? { catalog, controls: [], orientations: [] };
    group.controls.push(control);
    const orientation = input.orientation;
    if (typeof orientation === "string" && !group.orientations.includes(orientation)) group.orientations.push(orientation);
    groups.set(catalog, group);
  }
  return [...groups.values()].map((group) => Object.freeze({
    ...group,
    control: group.controls[0],
    orientations: Object.freeze([...group.orientations]),
  }));
}

export function selectedBuildControl(group, orientation) {
  if (!group) return null;
  return group.controls.find((control) => control.input?.orientation === orientation)
    ?? group.controls.find((control) => control.input?.orientation === undefined)
    ?? group.control;
}

export function nextOrientation(group, current) {
  const orientations = group?.orientations ?? [];
  if (orientations.length < 2) return current;
  const index = orientations.indexOf(current);
  return orientations[(index < 0 ? 0 : index + 1) % orientations.length];
}

export function defaultBuildMode(control) {
  const designation = control?.designation ?? [];
  if (designation.includes("line")) return "line";
  if (designation.includes("rectangle")) return "rectangle";
  return "point";
}

export function placementMode(control, modifiers = {}) {
  const allowed = control?.designation ?? [];
  if (modifiers.altKey && allowed.includes("line")) return "line";
  if (modifiers.shiftKey && allowed.includes("rectangle")) return "rectangle";
  return control?.command === "build" ? defaultBuildMode(control) : "point";
}

/** Human-readable state for the armed retained-style placement tool. */
export function placementHint(control, { area, hover, cells = 0 } = {}) {
  if (!control) return null;
  if (control.availability?.status === "unavailable")
    return `Waiting: ${control.availability.reason ?? "the world cannot admit this yet"}`;
  if (area?.rejection)
    return `Rejected: ${area.rejection}`;
  if (area?.value === "dragging")
    return `Preview: ${cells} ${cells === 1 ? "cell" : "cells"} · release to place`;
  if (hover)
    return "Preview: 1 cell · click to place";
  return control.target === "world-surface"
    ? "Choose a visible ground or structure surface"
    : "Choose a visible terrain top";
}
