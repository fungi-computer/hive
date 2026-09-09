import { createAir } from "../engine/environment/air/index.js";
import {
  createBrewhouseAirProgram,
  roomResult,
} from "../world-presets/brewhouse-air/region.ts";
import {
  BREWHOUSE_ROOM,
  roomAirDefinition,
} from "../world-presets/brewhouse-air/room.ts";

const CHECKPOINT_KIND = "hive-browser-brewhouse-air-v1";
const MAX_CHECKPOINT_BYTES = 512 * 1024;
const textEncoder = new TextEncoder();
const REQUEST_FIELDS = Object.freeze({
  inspect: ["id", "action"],
  reset: ["id", "action"],
  ignite: ["id", "action"],
  vent: ["id", "action", "open"],
  advance: ["id", "action", "seconds"],
  reopen: ["id", "action", "checkpoint"],
});

function exactRecord(value, fields, label) {
  const keys =
    value !== null && typeof value === "object" ? Reflect.ownKeys(value) : [];
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    keys.some((key) => {
      if (typeof key !== "string") return true;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !("value" in descriptor);
    }) ||
    keys.sort().join("\0") !== [...fields].sort().join("\0")
  )
    throw new TypeError(`invalid ${label}`);
  return value;
}

function parseRequest(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("invalid room request");
  const actionProperty = Object.getOwnPropertyDescriptor(value, "action");
  if (!actionProperty?.enumerable || !("value" in actionProperty))
    throw new TypeError("invalid room request");
  const action = actionProperty.value;
  const fields = REQUEST_FIELDS[action];
  if (!fields) throw new TypeError("unknown room request");
  exactRecord(value, fields, "room request");
  if (!Number.isSafeInteger(value.id) || value.id < 0)
    throw new TypeError("invalid room request id");
  return value;
}

function encodeCheckpoint(program, state, revision) {
  const wire = JSON.stringify({
    kind: CHECKPOINT_KIND,
    program: program.id,
    revision,
    state,
  });
  if (textEncoder.encode(wire).byteLength > MAX_CHECKPOINT_BYTES)
    throw new Error("local room checkpoint exceeds 512 KiB");
  return wire;
}

function decodeCheckpoint(program, wire) {
  if (
    typeof wire !== "string" ||
    textEncoder.encode(wire).byteLength > MAX_CHECKPOINT_BYTES
  )
    throw new TypeError("invalid local room checkpoint");
  const value = JSON.parse(wire);
  exactRecord(
    value,
    ["kind", "program", "revision", "state"],
    "local room checkpoint",
  );
  if (
    value.kind !== CHECKPOINT_KIND ||
    value.program !== program.id ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw new TypeError("incompatible local room checkpoint");
  return {
    revision: value.revision,
    state: program.parseState(value.state),
  };
}

function roomScene(program, state, revision) {
  const definition = roomAirDefinition(
    state.opening.open,
    state.opening.revision,
  );
  const facts = createAir(definition).read(state.air);
  return {
    revision,
    program: program.id,
    metric: [...definition.spacingM],
    bounds: {
      min: [...BREWHOUSE_ROOM.bounds.min],
      max: [...BREWHOUSE_ROOM.bounds.max],
    },
    sites: BREWHOUSE_ROOM.sites.map((site) => ({ ...site })),
    cells: facts.cells.map((cell) => ({
      cellId: cell.cellId,
      at: [...cell.at],
      volumeM3: cell.volumeM3,
      smokeKgM3: cell.smokeKgM3,
      temperatureK: cell.temperatureK,
    })),
    result: roomResult(state),
  };
}

function cloneState(program, state) {
  return program.parseState(structuredClone(state));
}

function commandFor(program, request) {
  if (request.action === "ignite")
    return program.parseCommand({ kind: "ignite" });
  if (request.action === "vent")
    return program.parseCommand({ kind: "vent", open: request.open });
  return program.parseCommand({ kind: "advance", seconds: request.seconds });
}

/** Browser-local host for the same registered room program. A prepared change
 * remains detached until the worker has successfully cloned its reply. */
export function createLocalBrewhouseSession() {
  const program = createBrewhouseAirProgram();
  let state = program.parseState(program.initial());
  let revision = 0;

  function snapshot(action, nextState, nextRevision, result = null) {
    const parsed = program.parseState(nextState);
    return {
      state: parsed,
      revision: nextRevision,
      reply: {
        ok: true,
        action,
        revision: nextRevision,
        result,
        scene: roomScene(program, parsed, nextRevision),
        checkpoint: encodeCheckpoint(program, parsed, nextRevision),
      },
    };
  }

  function rejected(request, transition) {
    const current = snapshot(request.action, state, revision);
    return {
      reply: {
        id: request.id,
        ok: false,
        action: request.action,
        revision,
        error:
          typeof transition.result.reason === "string"
            ? transition.result.reason
            : "room command rejected",
        scene: current.reply.scene,
        checkpoint: current.reply.checkpoint,
      },
      commit() {},
    };
  }

  function execute(request) {
    const command = commandFor(program, request);
    const principal =
      request.action === "advance" ? "room-host" : "room-player";
    const candidate = cloneState(program, state);
    if (!program.authorize(principal, command, cloneState(program, state)))
      throw new Error("local room command is forbidden");
    const transition = program.execute(candidate, command);
    if (transition.status === "rejected") return rejected(request, transition);
    return snapshot(request.action, candidate, revision + 1, transition.result);
  }

  function prepare(raw) {
    const request = parseRequest(raw);
    if (request.action === "inspect") {
      const staged = snapshot(request.action, state, revision);
      return { reply: { id: request.id, ...staged.reply }, commit() {} };
    }
    let staged;
    if (request.action === "reset") {
      staged = snapshot(request.action, program.initial(), 0);
    } else if (request.action === "reopen") {
      const reopened = decodeCheckpoint(program, request.checkpoint);
      staged = snapshot(request.action, reopened.state, reopened.revision);
    } else {
      staged = execute(request);
      if ("commit" in staged) return staged;
    }
    let committed = false;
    return {
      reply: { id: request.id, ...staged.reply },
      commit() {
        if (committed) throw new Error("local room stage already committed");
        committed = true;
        state = staged.state;
        revision = staged.revision;
      },
    };
  }

  return Object.freeze({ prepare });
}

if (typeof self !== "undefined" && "postMessage" in self) {
  const session = createLocalBrewhouseSession();
  self.onmessage = ({ data }) => {
    const id = Number.isSafeInteger(data?.id) ? data.id : -1;
    try {
      const staged = session.prepare(data);
      self.postMessage(staged.reply);
      staged.commit();
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        action: typeof data?.action === "string" ? data.action : "invalid",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
