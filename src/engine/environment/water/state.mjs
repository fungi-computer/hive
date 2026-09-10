import {
  assertWorldRecord as record,
  assertWorldArray as array,
} from "../../world/data-contract.mjs";
import { check, freeze, copyData } from "./geometry.mjs";
import { compensatedSum as sum } from "../arithmetic.mjs";

const VERSION = "finite-voxel-water-v1";
function validate(g, state) {
  record(
    state,
    ["version", "identity", "massKg", "initialTotalKg", "boundaryKg"],
    "water state",
  );
  check(
    state.version === VERSION && state.identity === g.identity,
    "current water definition and format",
  );
  array(state.massKg, g.nodes.length, "water stocks");
  check(state.massKg.length === g.nodes.length, "one stock per physical cell");
  for (let i = 0; i < state.massKg.length; i++) {
    const amount = state.massKg[i];
    check(
      Number.isFinite(amount) && amount >= 0 && amount <= g.nodes[i].capacityKg,
      "finite nonnegative water inside cell capacity",
    );
  }
  check(
    Number.isFinite(state.initialTotalKg) &&
      state.initialTotalKg >= 0 &&
      Number.isFinite(state.boundaryKg),
    "finite water reference and boundary",
  );
  const totalKg = sum(state.massKg);
  const residualKg = sum(
    [totalKg, -state.initialTotalKg, -state.boundaryKg].sort(
      (a, b) => Math.abs(b) - Math.abs(a),
    ),
  );
  check(
    Math.abs(residualKg) <= 1e-9 + 64 * Number.EPSILON * totalKg,
    "water quantity conservation",
  );
  return { totalKg, residualKg };
}
export function initial(g, raw) {
  const input = copyData(raw, g.limits);
  record(input, ["stocks"], "initial water");
  array(input.stocks, g.nodes.length, "initial cell stocks");
  check(
    input.stocks.length === g.nodes.length,
    "explicit water amount for every initial cell",
  );
  const massKg = new Array(g.nodes.length),
    seen = new Set();
  for (const entry of input.stocks) {
    record(entry, ["id", "massKg"], "initial cell stock");
    const i = g.index.get(entry.id);
    check(i !== undefined && !seen.has(i), "unique known initial stock cell");
    massKg[i] = entry.massKg;
    seen.add(i);
  }
  const state = {
    version: VERSION,
    identity: g.identity,
    massKg,
    initialTotalKg: sum(massKg),
    boundaryKg: 0,
  };
  validate(g, state);
  return freeze(state);
}
/** Only states returned by this owner use its identity cache. Unknown inputs
 * still cross the common plain-data boundary and complete quantity check. */
export function stateAdmission(g) {
  const trusted = new WeakSet();
  function remember(state) {
    validate(g, state);
    freeze(state);
    trusted.add(state);
    return state;
  }
  return {
    remember,
    parse(raw) {
      return trusted.has(raw) ? raw : remember(copyData(raw, g.limits));
    },
  };
}
export function waterFacts(g, state) {
  const balance = validate(g, state);
  return freeze({
    ...balance,
    initialTotalKg: state.initialTotalKg,
    boundaryKg: state.boundaryKg,
    cells: g.nodes.map((node, i) => ({
      id: node.id,
      at: node.at,
      kind: node.kind,
      massKg: state.massKg[i],
      capacityKg: node.capacityKg,
      mobileKg: Math.max(0, state.massKg[i] - node.retainedKg),
      liquidVolumeM3: node.kind === "void" ? state.massKg[i] / 1000 : 0,
      moisture:
        node.kind === "soil" ? state.massKg[i] / (1000 * node.volumeM3) : 0,
    })),
  });
}
