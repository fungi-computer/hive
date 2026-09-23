// Isolated research quantity owner. No spatial time integration or topology edits.
export const OWNER_VERSION = 'finite-ideal-mixture-v1';
export const UNIVERSAL_GAS_CONSTANT = 8.31446261815324; // J / (mol K)

function record(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be a record`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i]))
    throw new TypeError(`${label} has unsupported or missing fields`);
}

function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new RangeError(`${label} must be positive and finite`);
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new RangeError(`${label} must be finite`);
  return value;
}

function name(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || !value || value.length > 128)
    throw new TypeError(`${label} must be a nonempty bounded identifier`);
  return value;
}

function freeze(value) {
  for (const child of Object.values(value))
    if (child !== null && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

function ownDefinition(input) {
  record(input, ['version', 'energyConvention', 'species'], 'definition');
  name(input.version, 'definition version');
  if (input.energyConvention !== 'constant-cv-u-zero-at-zero-k')
    throw new TypeError('unsupported internal-energy convention');
  if (!Array.isArray(input.species) || input.species.length < 1 || input.species.length > 16)
    throw new RangeError('definition requires 1 to 16 species');
  const seen = new Set();
  const species = input.species.map((entry) => {
    record(entry, ['id', 'molarMassKgPerMol', 'cvJPerKgK', 'minTemperatureK', 'maxTemperatureK'], 'species definition');
    const id = name(entry.id, 'species ID');
    if (seen.has(id)) throw new TypeError('duplicate species definition');
    seen.add(id);
    const molarMassKgPerMol = positive(entry.molarMassKgPerMol, 'molar mass');
    const cvJPerKgK = positive(entry.cvJPerKgK, 'specific constant-volume capacity');
    const minTemperatureK = positive(entry.minTemperatureK, 'minimum temperature');
    const maxTemperatureK = positive(entry.maxTemperatureK, 'maximum temperature');
    if (maxTemperatureK <= minTemperatureK) throw new RangeError('empty temperature envelope');
    const specificR = positive(UNIVERSAL_GAS_CONSTANT / molarMassKgPerMol, 'specific gas constant');
    positive(cvJPerKgK + specificR, 'specific constant-pressure capacity');
    const gamma = positive(1 + specificR / cvJPerKgK, 'specific capacity ratio');
    if (!(gamma > 1)) throw new RangeError('unresolved capacity ratio');
    return { id, molarMassKgPerMol, cvJPerKgK, minTemperatureK, maxTemperatureK };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return freeze({ version: input.version, energyConvention: input.energyConvention, species });
}

/**
 * Canonical state is species masses [kg], volume [m3], internal energy [J].
 * Derived pressure is thermodynamic pressure [Pa], not projection pressure.
 * Definitions and state results are copied and deeply frozen plain objects.
 */
export function createThermodynamics(inputDefinition) {
  const definition = ownDefinition(inputDefinition);
  const definitionIdentity = JSON.stringify({
    ownerVersion: OWNER_VERSION,
    universalGasConstant: UNIVERSAL_GAS_CONSTANT,
    definition,
  });
  const byId = new Map(definition.species.map((entry) => [entry.id, entry]));

  function quantities(input) {
    record(input, ['speciesMassesKg', 'volumeM3', 'internalEnergyJ'], 'quantities');
    positive(input.volumeM3, 'volume');
    positive(input.internalEnergyJ, 'internal energy');
    if (!Array.isArray(input.speciesMassesKg) || !input.speciesMassesKg.length || input.speciesMassesKg.length > byId.size)
      throw new RangeError('nonempty supported species masses required');
    const seen = new Set();
    const speciesMassesKg = input.speciesMassesKg.map((entry) => {
      record(entry, ['id', 'massKg'], 'species mass');
      if (!byId.has(entry.id)) throw new TypeError('unknown species');
      if (seen.has(entry.id)) throw new TypeError('duplicate species mass');
      seen.add(entry.id);
      return { id: entry.id, massKg: positive(entry.massKg, 'species mass') };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const state = {
      version: OWNER_VERSION,
      definitionIdentity,
      speciesMassesKg,
      volumeM3: input.volumeM3,
      internalEnergyJ: input.internalEnergyJ,
    };
    derive(state); // Also rejects derived overflow/underflow or an invalid temperature.
    return freeze(state);
  }

  function admit(input) {
    record(input, ['version', 'definitionIdentity', 'speciesMassesKg', 'volumeM3', 'internalEnergyJ'], 'chamber state');
    if (input.version !== OWNER_VERSION || input.definitionIdentity !== definitionIdentity)
      throw new TypeError('chamber definition/version mismatch');
    return quantities({
      speciesMassesKg: input.speciesMassesKg,
      volumeM3: input.volumeM3,
      internalEnergyJ: input.internalEnergyJ,
    });
  }

  function derive(state) {
    let massKg = 0, amountMol = 0, constantVolumeCapacityJPerK = 0;
    let minTemperatureK = 0, maxTemperatureK = Infinity;
    for (const { id, massKg: mass } of state.speciesMassesKg) {
      const species = byId.get(id);
      massKg += mass;
      amountMol += mass / species.molarMassKgPerMol;
      constantVolumeCapacityJPerK += mass * species.cvJPerKgK;
      minTemperatureK = Math.max(minTemperatureK, species.minTemperatureK);
      maxTemperatureK = Math.min(maxTemperatureK, species.maxTemperatureK);
    }
    positive(massKg, 'total mass');
    positive(amountMol, 'total moles');
    positive(constantVolumeCapacityJPerK, 'total constant-volume capacity');
    const nR = positive(amountMol * UNIVERSAL_GAS_CONSTANT, 'molar gas capacity');
    const temperatureK = positive(state.internalEnergyJ / constantVolumeCapacityJPerK, 'temperature');
    if (temperatureK < minTemperatureK || temperatureK > maxTemperatureK)
      throw new RangeError('temperature outside definition envelope');
    const pressurePa = positive(nR * temperatureK / state.volumeM3, 'pressure');
    const densityKgPerM3 = positive(massKg / state.volumeM3, 'density');
    const constantPressureCapacityJPerK = positive(constantVolumeCapacityJPerK + nR, 'total constant-pressure capacity');
    const cvJPerKgK = positive(constantVolumeCapacityJPerK / massKg, 'mixture cv');
    const specificGasConstantJPerKgK = positive(nR / massKg, 'mixture gas constant');
    const cpJPerKgK = positive(cvJPerKgK + specificGasConstantJPerKgK, 'mixture cp');
    const gamma = positive(1 + nR / constantVolumeCapacityJPerK, 'capacity ratio');
    if (!(gamma > 1)) throw new RangeError('unresolved mixture capacity ratio');
    const enthalpyJ = positive(state.internalEnergyJ + pressurePa * state.volumeM3, 'enthalpy');
    return freeze({
      massKg, amountMol, temperatureK, pressurePa, densityKgPerM3,
      constantVolumeCapacityJPerK, constantPressureCapacityJPerK,
      cvJPerKgK, cpJPerKgK, specificGasConstantJPerKgK, gamma, enthalpyJ,
      temperatureEnvelopeK: [minTemperatureK, maxTemperatureK],
    });
  }

  function result(operation, before, next, heatIntoGasJ, workByGasJ) {
    const after = quantities(next);
    const internalEnergyChangeJ = after.internalEnergyJ - before.internalEnergyJ;
    const firstLawResidualJ = finite(internalEnergyChangeJ - (heatIntoGasJ - workByGasJ), 'first-law residual');
    return freeze({
      state: after,
      receipt: {
        operation,
        heatIntoGasJ,
        workByGasJ,
        internalEnergyChangeJ,
        firstLawResidualJ,
        massChangeKg: 0,
        volumeChangeM3: after.volumeM3 - before.volumeM3,
        before: { volumeM3: before.volumeM3, internalEnergyJ: before.internalEnergyJ },
        after: { volumeM3: after.volumeM3, internalEnergyJ: after.internalEnergyJ },
      },
    });
  }

  function heat(input, joules) {
    const before = admit(input);
    finite(joules, 'heat');
    const internalEnergyJ = before.internalEnergyJ + joules;
    if (joules !== 0 && internalEnergyJ === before.internalEnergyJ)
      throw new RangeError('heat is below representable energy resolution');
    return result('constant-volume-heat', before, {
      speciesMassesKg: before.speciesMassesKg,
      volumeM3: before.volumeM3,
      internalEnergyJ,
    }, joules, 0);
  }

  function freeExpand(input, targetVolumeM3) {
    const before = admit(input);
    positive(targetVolumeM3, 'target volume');
    if (targetVolumeM3 < before.volumeM3)
      throw new RangeError('isolated free expansion cannot compress gas');
    return result('isolated-free-expansion-equilibrium', before, {
      speciesMassesKg: before.speciesMassesKg,
      volumeM3: targetVolumeM3,
      internalEnergyJ: before.internalEnergyJ,
    }, 0, 0);
  }

  function adiabaticPiston(input, targetVolumeM3) {
    const before = admit(input);
    positive(targetVolumeM3, 'target volume');
    const { gamma } = derive(before);
    const internalEnergyJ = before.internalEnergyJ * Math.exp(
      (gamma - 1) * (Math.log(before.volumeM3) - Math.log(targetVolumeM3)),
    );
    return result('reversible-adiabatic-piston', before, {
      speciesMassesKg: before.speciesMassesKg,
      volumeM3: targetVolumeM3,
      internalEnergyJ,
    }, 0, before.internalEnergyJ - internalEnergyJ);
  }

  return Object.freeze({
    definition,
    definitionIdentity,
    create: quantities,
    read: (state) => derive(admit(state)),
    heat,
    freeExpand,
    adiabaticPiston,
    encode: (state) => JSON.stringify(admit(state)),
    decode: (text) => {
      if (typeof text !== 'string') throw new TypeError('encoded state must be text');
      return admit(JSON.parse(text));
    },
  });
}
