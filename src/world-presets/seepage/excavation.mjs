import { readScene } from './scene.mjs';
import { createVolume, createVolumeGeometry, balanceTolerance, compensatedSum } from '../../engine/environment/soil/index.js';
import { encode as encodeData, decode as decodeData } from '../../engine/region/codec.ts';
import { same, ordered, immutable, exactFields, coordinate, restoreWorld,
  excavateWorld, metric, requireCondition } from './world-binding.mjs';
import { deriveTopology, assertBaseGeometry, soilNodeId } from './topology.mjs';

const VERSION = 'height-caves-connected-excavation-v5';
const MAX_ENCODED = 1048576;
const STATE_FIELDS = ['version', 'identity', 'world', 'soilState', 'initialWaterKg', 'exports'];
const own = value => immutable(decodeData(encodeData(value, MAX_ENCODED), MAX_ENCODED));
const sameData = (a, b) => same(ordered(a), ordered(b));
const exportId = nodeId => `wet-spoil:${nodeId}`;

function validateLedger(config, state, facts, removed, voxelM3) {
  requireCondition(Array.isArray(state.exports) && state.exports.length === removed.length,
    'one wet-spoil export for each removed voxel');
  const expected = new Set(removed.map(cell => soilNodeId(cell.at))), seen = new Set();
  for (const entry of state.exports) {
    exactFields(entry, ['id', 'fromNodeId', 'soilId', 'waterKg', 'sourceVoxelM3'], 'wet-spoil export fields');
    const source = config.baseNodes.get(entry.fromNodeId);
    requireCondition(source && expected.has(entry.fromNodeId) && !seen.has(entry.fromNodeId) &&
      entry.id === exportId(entry.fromNodeId) && entry.soilId === source.soilId &&
      Number.isFinite(entry.waterKg) && entry.waterKg >= source.minMassKg &&
      entry.waterKg <= source.maxMassKg && entry.sourceVoxelM3 === voxelM3,
      'unique wet-spoil identity and actual source pore capacity');
    seen.add(entry.fromNodeId);
  }
  requireCondition(state.exports.every((entry, i, entries) => i === 0 || entries[i - 1].id < entry.id),
    'wet-spoil exports have canonical identity order');
  const exportWaterKg = compensatedSum(state.exports.map(entry => entry.waterKg));
  const pitWaterKg = compensatedSum(facts.nodes.filter(node => node.kind === 'pit').map(node => node.massKg));
  const totalWaterKg = compensatedSum([facts.totalMassKg, exportWaterKg]);
  requireCondition(Number.isFinite(state.initialWaterKg) && state.initialWaterKg > 0 &&
    Math.abs(totalWaterKg - state.initialWaterKg) <= balanceTolerance(state.initialWaterKg),
    'soil plus finite spoil plus columns must retain the original water total');
  return { retainedWaterKg: facts.totalMassKg - pitWaterKg, exportWaterKg, pitWaterKg,
    totalWaterKg, residualKg: totalWaterKg - state.initialWaterKg };
}

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
  previous.delete(removedId);
  const geometry = createVolumeGeometry(owner.geometry);
  const initial = owner.initial({ stocks: geometry.nodes.map(node => {
    requireCondition(previous.has(node.id) || node.kind === 'pit', 'surviving pore stock retains its owner');
    return { nodeId: node.id, massKg: previous.get(node.id) ?? 0 };
  }) });
  return owner.decode(JSON.stringify({ ...initial, timeS: clock.timeS, steps: clock.steps }));
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
    const sourceId = soilNodeId(at), source = config.baseNodes.get(sourceId);
    const stock = checked.facts.nodes.find(node => node.nodeId === sourceId);
    requireCondition(source && stock, 'excavation targets one remaining owned world-soil voxel');
    // Never edit the retained read projection: failed and successful cuts must
    // leave both the prior checkpoint and its future scene queries unchanged.
    const world = restoreWorld(config.worldIdentity, checked.state.world);
    excavateWorld(world, { at, expectedWorldRevision: world.describe().revision });
    const candidate = deriveTopology(config, world);
    const soil = remapStock(candidate.owner, checked.facts, sourceId, checked.soil);
    const exports = [...checked.state.exports, { id: exportId(sourceId), fromNodeId: sourceId,
      soilId: source.soilId, waterKg: stock.massKg, sourceVoxelM3: checked.physical.voxelM3 }]
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
