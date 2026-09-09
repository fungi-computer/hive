import * as Commands from "./vendor/editor/js/commands/Commands.js";

const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const vector = (value, rotation = false) =>
  Array.isArray(value) &&
  value.length === (rotation ? 4 : 3) &&
  value.slice(0, 3).every(Number.isFinite) &&
  (!rotation || ["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"].includes(value[3]));
const text = (value) =>
  typeof value === "string" && value.length > 0 && value.length < 512;

// Admission checks native command records before History.fromJSON can construct
// them. This does not execute/replay arbitrary imported history against the scene.
export function checkHistory(history) {
  let count = 0;
  function visit(command, nested = false) {
    if (
      ++count > 2000 ||
      !record(command) ||
      !Object.hasOwn(Commands, command.type) ||
      command.type.includes("Script")
    )
      throw new Error("Unsupported project history command");
    if (
      !Number.isSafeInteger(command.id) ||
      command.id < (nested ? -1 : 0) ||
      typeof command.name !== "string"
    )
      throw new Error("Invalid native history identity");
    if (["MultiCmdsCommand", "SetSceneCommand"].includes(command.type)) {
      if (!Array.isArray(command.cmds))
        throw new Error("Invalid nested history");
      command.cmds.forEach((child) => visit(child, true));
      return;
    }
    if (["AddObjectCommand", "RemoveObjectCommand"].includes(command.type)) {
      if (!record(command.object) || !text(command.object.object?.uuid))
        throw new Error("Invalid history object snapshot");
    } else if (command.type === "SetUuidCommand") {
      if (!text(command.oldUuid) || !text(command.newUuid))
        throw new Error("Invalid history UUID");
    } else if (!text(command.objectUuid))
      throw new Error("Invalid history object reference");
    if (
      Object.hasOwn(command, "attributeName") &&
      (!text(command.attributeName) ||
        ["__proto__", "constructor", "prototype"].includes(
          command.attributeName,
        ))
    )
      throw new Error("Invalid history attribute");
    for (const suffix of ["Position", "Rotation", "Scale"])
      if (command.type === `Set${suffix}Command`) {
        if (
          !vector(command[`old${suffix}`], suffix === "Rotation") ||
          !vector(command[`new${suffix}`], suffix === "Rotation")
        )
          throw new Error("Invalid history transform");
      }
    if (
      command.type === "MoveObjectCommand" &&
      (!text(command.oldParentUuid) ||
        !text(command.newParentUuid) ||
        !Number.isInteger(command.oldIndex) ||
        !Number.isInteger(command.newIndex))
    )
      throw new Error("Invalid history hierarchy move");
  }
  if (!record(history)) throw new Error("Invalid project history");
  const ids = new Set();
  for (const key of ["undos", "redos"]) {
    if (!Array.isArray(history[key]) || history[key].length > 1000)
      throw new Error("Invalid project history");
    for (const command of history[key]) {
      visit(command);
      if (ids.has(command.id))
        throw new Error("Duplicate native history identity");
      ids.add(command.id);
    }
  }
}
