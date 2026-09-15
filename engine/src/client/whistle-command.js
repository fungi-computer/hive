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

function requireSingleEntityBinding(selection) {
  if (
    typeof selection.field !== "string" ||
    selection.field.length === 0 ||
    selection.cardinality !== "one"
  )
    throw new Error("invalid entity selection binding");
  return selection.field;
}

function requireFreePresetField(preset, field) {
  if (preset === undefined) return;
  if (!isObjectPreset(preset) || Object.hasOwn(preset, field))
    throw new Error("entity selection binding preset collision");
}

function bindSingleEntity(control, selected) {
  const field = requireSingleEntityBinding(control.selection);
  const preset = control.preset;
  requireFreePresetField(preset, field);
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
  if (source !== undefined && !["structure", "placement"].includes(source))
    throw new Error("invalid terrain target source");
  if (source !== undefined && control.target !== "world-surface")
    throw new Error(`${source} target requires a world-surface binding`);
  if (!validCell(target.cell))
    throw new Error("invalid terrain target cell");
  return source;
}

function validCell(cell) {
  return (
    Array.isArray(cell) &&
    cell.length === 3 &&
    cell.every(Number.isSafeInteger)
  );
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
  if (commandName(control) !== "build" || !["world-surface", "world-edge"].includes(control.target))
    throw new Error("binding is not a world build");
  if (!designation || typeof designation !== "object")
    throw new Error("build designation is missing");
  if (designation.mode && !control.designation?.includes(designation.mode))
    throw new Error("build designation mode is not supported by this binding");
  if (designation.mode === "edge-line" || designation.edges !== undefined) {
    if (!Array.isArray(designation.edges) || designation.edges.length === 0)
      throw new Error("edge build requires an edge designation");
    if (control.target !== "world-edge" || !control.designation?.includes("edge-line"))
      throw new Error("edge designation is not supported by this binding");
    if (designation.edges.length > 256 || designation.edges.some(edge =>
      !isObjectPreset(edge) || !validCell(edge.cell) || !["x", "z"].includes(edge.axis)
      || Object.keys(edge).some(key => key !== "cell" && key !== "axis")))
      throw new Error("invalid edge designation");
    const command = bindingCommand(control, selected);
    if (command.input !== undefined && (!isObjectPreset(command.input) || "target" in command.input))
      throw new Error("edge binding preset already contains target");
    return { ...command, input: jsonInput({ ...(command.input ?? {}), target: { edges: designation.edges } }) };
  }
  if (control.target === "world-edge") throw new Error("edge build requires an edge designation");
  if (designation.mode === "rectangle") {
    if (!validCell(designation.start) || !validCell(designation.end))
      throw new Error("rectangle build requires start and end cells");
    return terrainAreaCommand(control, selected, {
      start: designation.start,
      end: designation.end,
    });
  }
  if (!Array.isArray(designation.cells) || designation.cells.length !== 1 || !validCell(designation.cells[0]))
    throw new Error("point build requires one cell");
  if (designation.cells.length === 1)
    return terrainCellCommand(control, selected, {
      cell: designation.cells[0],
    });
}
