import { readScene } from './scene.mjs';
import { createVolume, createVolumeGeometry } from '../../engine/environment/soil/index.js';
import { encode as encodeData, decode as decodeData } from '../../engine/region/codec.ts';
import { same, ordered, immutable, exactFields, coordinate, restoreWorld,
  excavateWorld, metric, requireCondition } from './world-binding.mjs';
import { deriveTopology, assertBaseGeometry } from './topology.mjs';
import { removalSource, validateLedger } from './source-record.mjs';

const VERSION = 'height-caves-connected-excavation-v6';
const MAX_ENCODED = 1048576;
const STATE_FIELDS = ['version', 'identity', 'world', 'soilState', 'initialWaterKg', 'exports'];
const own = value => immutable(decodeData(encodeData(value, MAX_ENCODED), MAX_ENCODED));
const sameData = (a, b) => same(ordered(a), ordered(b));

function validate(config, identity, input) {
  // Shared plain-data codec rejects accessors before following nested world,
  // geometry or stock fields. Its clone is the detached transition candidate.
  const state = own(input);
  exactFields(state, STATE_FIELDS, 'combined excavation checkpoint fields');
  requireCondition(state.version === VERSION && state.identity === identity, 'excavation world/region/policy identity');
  const world = restoreWorld(config.worldIdentity, state.world), physical = metric(world);
  const topology = deriveTopology(config, world), owner = topology.owner;
  const soil = owner.decode(JSON.stringify(state.soilState)), facts = owner.read(soil);
  requireCondition(sameData(world.save(), state.world), 'canonical world checkpoint');
  const balance = validateLedger(config, state, facts, topology.removed, physical.voxelM3);
  return { ...topology, state, world, physical, soil, facts, balance };
}

function remapStock(owner, facts, removedId, clock) {
  const previous = new Map(facts.nodes.map(node => [node.nodeId, node.massKg]));
  if (removedId !== null) previous.delete(removedId);
  const geometry = createVolumeGeometry(owner.geometry);
  const initial = owner.initial({ stocks: geometry.nodes.map(node => {
    requireCondition(previous.has(node.id) || node.kind === 'pit', 'surviving pore stock retains its owner');
    return { nodeId: node.id, massKg: previous.get(node.id) ?? 0 };
  }) });
  // An impermeable cut changes only geometry. Keep its accumulated reference
  // total too, rather than rebase it on a rounded sum of otherwise exact stocks.
  return owner.decode(JSON.stringify({ ...initial,
    initialTotalKg: removedId === null ? clock.initialTotalKg : initial.initialTotalKg,
    timeS: clock.timeS, steps: clock.steps }));
}

export function createExcavationAdapter(input) {
  exactFields(input, ['worldIdentity', 'baseSoilGeometry', 'surfaceCoefficient'], 'explicit adapter binding');
  const admitted = own(input), world = restoreWorld(admitted.worldIdentity, null);
  const base = createVolumeGeometry(admitted.baseSoilGeometry);
  assertBaseGeometry(world, base.descriptor);
  requireCondition(same(base.descriptor.spacingM, metric(world).spacingM), 'soil uses the bound world metric');
  requireCondition(Number.isFinite(admitted.surfaceCoefficient) && admitted.surfaceCoefficient >= 0 &&
    admitted.surfaceCoefficient <= 1, 'explicit dimensionless surface exchange coefficient');
  const definition = own({ worldIdentity: ordered(world.describe().identity),
    baseSoilGeometry: base.descriptor, surfaceCoefficient: admitted.surfaceCoefficient });
  const identity = JSON.stringify({ version: VERSION, ...definition });
  const config = { ...definition, baseNodes: new Map(base.nodes.map(node => [node.id, node])) };

  // Only checkpoints produced by this owner enter the cache. Unknown objects,
  // including frozen objects or a matching revision, still cross full admission.
  // Keys are weak: a discarded world does not leave a resident simulation behind.
  const admissions = new WeakMap();
  function remember(checked) {
    immutable(checked.facts);
    immutable(checked.contacts);
    immutable(checked.balance);
    admissions.set(checked.state, checked);
    return checked;
  }
  function admit(input) {
    const known = input !== null && typeof input === 'object' ? admissions.get(input) : null;
    return known ?? remember(validate(config, identity, input));
  }
  function acceptWaterAdvance(checked, soil) {
    // The pure volume owner has changed only stock/time. World, exports, metric
    // and compiled topology remain the same immutable facts. Validate the new
    // physical stock and cross-owner balance, without regenerating the world.
    const state = Object.freeze({ ...checked.state, soilState: soil });
    const facts = checked.owner.read(soil);
    const balance = validateLedger(config, state, facts, checked.removed, checked.physical.voxelM3);
    // Numeric text can grow despite unchanged geometry. Keep the exact wire
    // size/data budget before publication; a hot result must remain savable.
    encodeData(state, MAX_ENCODED);
    return remember({ ...checked, state, soil, facts, balance });
  }

  function initial(input) {
    exactFields(input, ['world', 'soilState'], 'initial canonical world/soil inputs');
    const supplied = own(input), world = restoreWorld(config.worldIdentity, supplied.world);
    assertBaseGeometry(world, config.baseSoilGeometry);
    const owner = createVolume(config.baseSoilGeometry), soil = owner.decode(JSON.stringify(supplied.soilState));
    const state = own({ version: VERSION, identity, world: world.save(), soilState: soil,
      initialWaterKg: soil.initialTotalKg, exports: [] });
    return admit(state).state;
  }

  function excavate(input, rawCommand) {
    exactFields(rawCommand, ['at'], 'coordinate-only excavation command');
    const at = coordinate(rawCommand.at), checked = admit(input);
    const source = removalSource(config, checked.world, at);
    requireCondition(checked.world.inspect({ x: at[0], y: at[1], z: at[2] }).material === source.materialId,
      'excavation targets one remaining original solid voxel');
    const stock = source.kind === 'porous'
      ? checked.facts.nodes.find(node => node.nodeId === source.nodeId) : null;
    requireCondition(source.kind !== 'porous' || stock, 'excavation targets one remaining owned world-soil voxel');
    requireCondition(source.kind !== 'impermeable' || checked.columns.some(column =>
      column.at[0] === at[0] && column.at[2] === at[2] && column.at[1] === at[1] + 1),
      'impermeable excavation must deepen the bottom of an existing vented column');
    // Never edit the retained read projection: failed and successful cuts must
    // leave both the prior checkpoint and its future scene queries unchanged.
    const world = restoreWorld(config.worldIdentity, checked.state.world);
    excavateWorld(world, { at, expectedMaterial: source.materialId, expectedWorldRevision: world.describe().revision });
    const candidate = deriveTopology(config, world);
    const soil = remapStock(candidate.owner, checked.facts, source.kind === 'porous' ? source.nodeId : null, checked.soil);
    const exports = [...checked.state.exports, { ...source,
      waterKg: stock?.massKg ?? 0, sourceVoxelM3: checked.physical.voxelM3 }]
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const state = own({ ...checked.state, world: world.save(), soilState: soil, exports });
    const accepted = admit(state);
    // Retry belongs to Region receipts. This operation performs one actual cut;
    // a second direct call on an open voxel is a domain rejection.
    return { state: accepted.state, balance: accepted.balance, contacts: accepted.contacts };
  }

  return Object.freeze({ identity, definition, initial, excavate,
    parse: input => admit(input).state,
    scene: (input, bounds) => {
      const checked = admit(input);
      return readScene(checked, checked.state, bounds);
    },
    read: input => {
      const checked = admit(input);
      return { balance: checked.balance, contacts: checked.contacts, soil: checked.facts,
        hydraulicStatus: checked.columns.length === 0 ? 'original-volume-owner' : 'connected-finite-columns',
        finiteGas: false, timeS: checked.soil.timeS, steps: checked.soil.steps };
    },
    encode: input => encodeData(admit(input).state, MAX_ENCODED),
    decode: raw => admit(decodeData(raw, MAX_ENCODED)).state,
    advance: (input, intervalS) => {
      requireCondition(Number.isFinite(intervalS) && intervalS >= 0 && intervalS <= 600,
        'bounded local physical advance in0..600 seconds');
      const checked = admit(input);
      const result = checked.owner.advance(checked.soil, intervalS, { dtMaxS: 6 });
      const accepted = acceptWaterAdvance(checked, result.state);
      return { state: accepted.state, receipt: result.receipt, work: result.work, balance: accepted.balance };
    },
  });
}
