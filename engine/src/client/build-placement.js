/** Pure helpers for the shared, retained-style construction tool. */
export function buildControls(controls) {
  const groups = new Map();
  for (const control of controls ?? []) {
    if (control.command !== "build" || control.target !== "world-surface") continue;
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

/** Derive the compact catalog copy from the game definition and placement policy. */
export function buildCatalogDetails(catalog, environment, placement, allowedOrientations = []) {
  const definition = environment?.structures?.catalog?.find((entry) => entry.id === catalog);
  const policy = placement?.[catalog];
  if (!definition || !policy) return null;
  const cost = definition.materials.map(({ kind, quantity }) => `${quantity} ${kind}`).join(" + ");
  const shape = definition.shape;
  const footprint = shape.kind === "fixture" && Array.isArray(shape.footprint)
    ? `${Math.max(...shape.footprint.map(([x]) => x)) - Math.min(...shape.footprint.map(([x]) => x)) + 1}×${Math.max(...shape.footprint.map(([, z]) => z)) - Math.min(...shape.footprint.map(([, z]) => z)) + 1}`
    : shape.kind === "stair" ? `${shape.run}×${shape.rise} stair` : shape.kind;
  const gesture = policy.alignment === "stroke"
    ? "drag line · auto-facing"
    : definition.shape.kind === "floor" || definition.shape.kind === "cover"
      ? "drag rectangle"
      : "click point";
  const orientation = allowedOrientations.length > 1
    ? allowedOrientations.join("/")
    : policy.alignment === "stroke" ? "auto-facing" : allowedOrientations[0] ?? "fixed";
  return Object.freeze({ cost, footprint, gesture, orientation, summary: `${cost} · ${footprint} · ${gesture} · ${orientation}` });
}
