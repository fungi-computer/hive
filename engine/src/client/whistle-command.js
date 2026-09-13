function jsonInput(value) {
  const encoded = JSON.stringify(value, (_key, item) => {
    if (typeof item === "number" && !Number.isFinite(item))
      throw new Error("command input contains a nonfinite number");
    if (["undefined", "function", "symbol", "bigint"].includes(typeof item))
      throw new Error("command input must be JSON");
    return item;
  });
  if (new TextEncoder().encode(encoded).byteLength > 4096)
    throw new Error("command input is too large");
  return JSON.parse(encoded);
}

function commandName(control) {
  const index = control.commandId.indexOf(":");
  if (index <= 0 || index === control.commandId.length - 1)
    throw new Error("invalid local Whistle command ID");
  return control.commandId.slice(index + 1);
}

function validateSelection(selected) {
  if (
    !Array.isArray(selected) ||
    selected.length > 128 ||
    selected.some((id) => typeof id !== "string" || !id || id.length > 128)
  )
    throw new Error("invalid command selection");
}

function scopedSelection(control, selected) {
  validateSelection(selected);
  const scoped =
    control.subjects === undefined
      ? selected
      : selected.filter((id) => control.subjects.includes(id));
  return [...new Set(scoped)];
}

function isObjectPreset(preset) {
  return (
    preset !== null && typeof preset === "object" && !Array.isArray(preset)
  );
}

function bindSingleEntity(control, selected) {
  const { field, cardinality } = control.selection;
  if (typeof field !== "string" || !field || cardinality !== "one")
    throw new Error("invalid entity selection binding");
  const preset = control.preset;
  if (
    preset !== undefined &&
    (!isObjectPreset(preset) || Object.hasOwn(preset, field))
  )
    throw new Error("entity selection binding preset collision");
  const scoped = scopedSelection(control, selected);
  if (scoped.length !== 1 || selected.length !== 1)
    throw new Error(
      "entity selection binding requires exactly one selected subject",
    );
  return { ...(preset ?? {}), [field]: scoped[0] };
}

function bindEntities(control, selected) {
  const scoped = scopedSelection(control, selected);
  const preset = control.preset;
  if (preset !== undefined && (!isObjectPreset(preset) || "entities" in preset))
    throw new Error("selection binding requires an object preset");
  return { ...(preset ?? {}), entities: scoped };
}

export function bindingCommand(control, selected = []) {
  if (control.selection && typeof control.selection === "object") {
    return {
      type: "command",
      name: commandName(control),
      input: jsonInput(bindSingleEntity(control, selected)),
    };
  }
  if (control.selection !== "entities")
    return {
      type: "command",
      name: commandName(control),
      input: control.preset,
    };
  return {
    type: "command",
    name: commandName(control),
    input: jsonInput(bindEntities(control, selected)),
  };
}

function validateSurfaceTarget(control, target) {
  if (control.target !== "terrain-cell" && control.target !== "world-surface")
    throw new Error("binding does not accept a surface");
  const source = target.source;
  if (source !== undefined && source !== "structure" && source !== "placement")
    throw new Error("invalid terrain target source");
  if (source !== undefined && control.target !== "world-surface")
    throw new Error(`${source} target requires a world-surface binding`);
  if (
    !Array.isArray(target.cell) ||
    target.cell.length !== 3 ||
    !target.cell.every(Number.isSafeInteger)
  )
    throw new Error("invalid terrain target cell");
  return source;
}

function addTarget(control, input, target) {
  if (input !== undefined && (!isObjectPreset(input) || "target" in input))
    throw new Error("surface binding preset already contains target");
  const value =
    control.target === "world-surface"
      ? { cell: [...target.cell] }
      : {
          cell: [...target.cell],
          ...(target.source === undefined ? { material: target.material } : {}),
        };
  return jsonInput({ ...(input ?? {}), target: value });
}

export function terrainCellCommand(control, selected, target) {
  validateSurfaceTarget(control, target);
  const command = bindingCommand(control, selected);
  return { ...command, input: addTarget(control, command.input, target) };
}

function validateArea(area) {
  for (const cell of [area.start, area.end])
    if (
      !Array.isArray(cell) ||
      cell.length !== 3 ||
      !cell.every(Number.isSafeInteger)
    )
      throw new Error("invalid terrain area cell");
  const width = Math.abs(area.end[0] - area.start[0]) + 1;
  const depth = Math.abs(area.end[2] - area.start[2]) + 1;
  if (
    area.start[1] !== area.end[1] ||
    !Number.isSafeInteger(width * depth) ||
    width * depth > 256
  )
    throw new Error("terrain area exceeds 256 cells");
}

export function terrainAreaCommand(control, selected, area) {
  if (control.target !== "terrain-area" && control.target !== "world-surface")
    throw new Error("binding does not accept an area");
  validateArea(area);
  const command = bindingCommand(control, selected),
    input = command.input;
  if (input !== undefined && (!isObjectPreset(input) || "area" in input))
    throw new Error("area binding preset already contains area");
  const selection = { start: [...area.start], end: [...area.end] };
  return {
    ...command,
    input: jsonInput({
      ...(input ?? {}),
      ...(control.target === "world-surface"
        ? { target: { area: selection } }
        : { area: selection }),
    }),
  };
}

/** Bind a completed shared placement to the one build command. */
export function buildPlacementCommand(control, selected, designation) {
  if (commandName(control) !== "build" || control.target !== "world-surface")
    throw new Error("binding is not a world-surface build");
  if (
    !designation ||
    !Array.isArray(designation.cells) ||
    designation.cells.length === 0
  )
    throw new Error("build designation has no cells");
  if (designation.mode && !control.designation?.includes(designation.mode))
    throw new Error("build designation mode is not supported by this binding");
  if (designation.cells.length === 1)
    return terrainCellCommand(control, selected, {
      cell: designation.cells[0],
    });
  return terrainAreaCommand(control, selected, {
    start: designation.start,
    end: designation.end,
  });
}
