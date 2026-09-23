import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createThermodynamics, UNIVERSAL_GAS_CONSTANT as R } from './thermodynamics.mjs';
import { INERT_DEFINITION } from './definitions.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const wallStart = performance.now(), cpuStart = process.cpuUsage();
const sourceFiles = ['thermodynamics.mjs', 'definitions.mjs', 'CONTRACT.md', 'qualify.mjs'];
const sourcePins = Object.fromEntries(sourceFiles.map((file) => [file,
  createHash('sha256').update(readFileSync(root + file)).digest('hex'),
]));
const thermo = createThermodynamics(INERT_DEFINITION);
const groups = [];
let assertions = 0, operations = 0, rejections = 0;
const errors = {};
const close = (label, actual, expected, tolerance = 2e-12) => {
  assertions++;
  const absoluteError = Math.abs(actual - expected);
  const scaledError = absoluteError / Math.max(1, Math.abs(expected));
  errors[label] = { actual, expected, absoluteError, scaledError };
  assert(Number.isFinite(actual) && scaledError <= tolerance, `${label}: ${actual} != ${expected}`);
};
const equal = (actual, expected) => { assertions++; assert.deepEqual(actual, expected); };
const truth = (value, label) => { assertions++; assert(value, label); };
const reject = (fn, pattern) => { rejections++; assertions++; assert.throws(fn, pattern); };
const step = (method, ...args) => { operations++; return thermo[method](...args); };
const group = (name, fn) => {
  const start = performance.now();
  fn();
  groups.push({ name, milliseconds: performance.now() - start });
};
const masses = (airMol, heliumMol = 0) => [
  ...(airMol ? [{ id: 'inert-air', massKg: airMol * 0.02897 }] : []),
  ...(heliumMol ? [{ id: 'inert-helium', massKg: heliumMol * 0.004002602 }] : []),
];
const air = thermo.create({ speciesMassesKg: masses(1), volumeM3: 0.0264, internalEnergyJ: 2.5 * R * 320 });
const mix = thermo.create({ speciesMassesKg: masses(1, 1), volumeM3: 0.05, internalEnergyJ: 4 * R * 300 });

try {
  group('independent one-mole and two-mole EOS/capacities', () => {
    const a = thermo.read(air);
    close('air_temperature_K', a.temperatureK, 320);
    close('air_pressure_Pa', a.pressurePa, R * 320 / 0.0264);
    close('air_gamma', a.gamma, 1.4);
    close('air_moles', a.amountMol, 1);
    const helium = thermo.create({ speciesMassesKg: masses(0, 1), volumeM3: 0.0264, internalEnergyJ: 1.5 * R * 320 });
    const h = thermo.read(helium);
    close('helium_same_moles_pressure_Pa', h.pressurePa, a.pressurePa);
    close('helium_gamma', h.gamma, 5 / 3);
    const m = thermo.read(mix);
    close('mixture_temperature_K', m.temperatureK, 300);
    close('mixture_moles', m.amountMol, 2);
    close('mixture_mass_kg', m.massKg, 0.032972602);
    close('mixture_pressure_Pa', m.pressurePa, 2 * R * 300 / 0.05);
    close('mixture_density_kg_m3', m.densityKgPerM3, 0.032972602 / 0.05);
    close('mixture_cv_J_kg_K', m.cvJPerKgK, 4 * R / 0.032972602);
    close('mixture_cp_J_kg_K', m.cpJPerKgK, 6 * R / 0.032972602);
    close('mixture_cp_minus_cv', m.cpJPerKgK - m.cvJPerKgK, 2 * R / 0.032972602);
    close('mixture_gamma', m.gamma, 1.5);
    close('mixture_enthalpy_J', m.enthalpyJ, 6 * R * 300);
  });

  group('heat and isolated free expansion are distinct from piston work', () => {
    const added = step('heat', mix, 4 * R * 30);
    close('heated_temperature_K', thermo.read(added.state).temperatureK, 330);
    close('heat_receipt_J', added.receipt.heatIntoGasJ, 4 * R * 30);
    close('heat_first_law_residual_J', added.receipt.firstLawResidualJ, 0);
    equal(added.receipt.workByGasJ, 0);
    equal(added.state.speciesMassesKg, mix.speciesMassesKg);
    const free = step('freeExpand', mix, 0.1);
    equal(free.state.internalEnergyJ, mix.internalEnergyJ);
    equal(free.state.speciesMassesKg, mix.speciesMassesKg);
    close('free_temperature_K', thermo.read(free.state).temperatureK, 300);
    close('free_pressure_Pa', thermo.read(free.state).pressurePa, R * 300 / 0.05);
    equal([free.receipt.heatIntoGasJ, free.receipt.workByGasJ, free.receipt.firstLawResidualJ], [0, 0, 0]);
    reject(() => thermo.freeExpand(free.state, 0.05), /cannot compress/);
    const piston = step('adiabaticPiston', mix, 0.1);
    close('piston_temperature_K', thermo.read(piston.state).temperatureK, 300 / Math.SQRT2);
    close('piston_work_J', piston.receipt.workByGasJ, 4 * R * 300 * (1 - 1 / Math.SQRT2));
    close('piston_pVgamma', thermo.read(piston.state).pressurePa * 0.1 ** 1.5,
      2 * R * 300 / 0.05 * 0.05 ** 1.5);
    close('piston_first_law_residual_J', piston.receipt.firstLawResidualJ, 0);
    truth(free.state.internalEnergyJ > piston.state.internalEnergyJ, 'free expansion did not perform piston work');

    // Independent work integral: Simpson quadrature of the analytic pressure
    // path, rather than subtracting the candidate's internal-energy formula.
    const integral = (panels) => {
      const v0 = 0.05, v1 = 0.1, dv = (v1 - v0) / panels;
      const p0 = 2 * R * 300 / v0;
      const pressure = (v) => p0 * (v0 / v) ** 1.5;
      let sum = pressure(v0) + pressure(v1);
      for (let i = 1; i < panels; i++) sum += (i % 2 ? 4 : 2) * pressure(v0 + i * dv);
      return sum * dv / 3;
    };
    const coarse = integral(64), fine = integral(128), finer = integral(256);
    errors.piston_independent_quadrature = { coarseJ: coarse, fineJ: fine, finerJ: finer,
      refinementDifferenceJ: Math.abs(finer - fine), previousDifferenceJ: Math.abs(fine - coarse) };
    truth(Math.abs(finer - fine) < Math.abs(fine - coarse) / 12, 'Simpson reference converges before comparison');
    close('piston_work_vs_independent_integral_J', piston.receipt.workByGasJ, finer, 1e-10);
    const back = step('adiabaticPiston', piston.state, 0.05);
    close('reversible_return_U_J', back.state.internalEnergyJ, mix.internalEnergyJ);
    close('reversible_net_work_J', piston.receipt.workByGasJ + back.receipt.workByGasJ, 0, 5e-12);
    equal(back.state.speciesMassesKg, mix.speciesMassesKg);
  });

  group('ordering, discard-before-commit, and finite receipt rounding', () => {
    const before = thermo.encode(mix);
    const discarded = step('heat', mix, 500);
    equal(thermo.encode(mix), before);
    truth(discarded.state !== mix, 'candidate owns a new state');
    const ab = step('heat', step('heat', mix, 500).state, 700);
    const ba = step('heat', step('heat', mix, 700).state, 500);
    close('heat_commutation_U_J', ab.state.internalEnergyJ, ba.state.internalEnergyJ);
    const hp = step('adiabaticPiston', step('heat', mix, 500).state, 0.075);
    const ph = step('heat', step('adiabaticPiston', mix, 0.075).state, 500);
    close('heat_piston_noncommutation_J', ph.state.internalEnergyJ - hp.state.internalEnergyJ,
      500 * (1 - 1 / Math.sqrt(1.5)));
    const repeated = step('heat', discarded.state, 500);
    close('repeat_is_second_heat_J', repeated.state.internalEnergyJ - mix.internalEnergyJ, 1000);

    // Arbitrary fractional heat at large finite U must report its rounding,
    // rather than falsely claiming exact first-law zero or silently clamping.
    const big = thermo.create({ speciesMassesKg: masses(1e10), volumeM3: 1e8, internalEnergyJ: 2.5 * R * 320 * 1e10 });
    const fractional = step('heat', big, 0.123456789);
    const residual = fractional.receipt.firstLawResidualJ;
    equal(residual, (fractional.state.internalEnergyJ - big.internalEnergyJ) - 0.123456789);
    truth(Number.isFinite(residual) && residual !== 0, 'rounding is observable');
    truth(Math.abs(residual) <= Number.EPSILON * big.internalEnergyJ, 'rounding stays within one U-scaled epsilon');
    errors.large_energy_heat_rounding = { beforeJ: big.internalEnergyJ, requestedJ: 0.123456789,
      actualDeltaJ: fractional.receipt.internalEnergyChangeJ, residualJ: residual };
    reject(() => thermo.heat(big, 1e-100), /representable energy resolution/);
    equal(thermo.encode(mix), before);
  });

  group('owned immutable inputs/results and rejected physical operations', () => {
    const rawDefinition = JSON.parse(JSON.stringify(INERT_DEFINITION));
    const isolated = createThermodynamics(rawDefinition);
    const raw = { speciesMassesKg: masses(1), volumeM3: 0.0264, internalEnergyJ: 2.5 * R * 320 };
    const owned = isolated.create(raw), pin = isolated.encode(owned);
    rawDefinition.species[0].cvJPerKgK = 1;
    raw.speciesMassesKg[0].massKg = 42;
    raw.volumeM3 = 42;
    equal(isolated.encode(owned), pin);
    reject(() => { owned.speciesMassesKg[0].massKg = 42; }, /read only/);
    const candidate = isolated.heat(owned, 20);
    reject(() => { candidate.receipt.before.internalEnergyJ = 42; }, /read only/);
    reject(() => { isolated.definition.species[0].cvJPerKgK = 1; }, /read only/);
    for (const q of [NaN, Infinity, -Infinity, '1', -owned.internalEnergyJ, owned.internalEnergyJ * 2])
      reject(() => isolated.heat(owned, q));
    for (const v of [0, -1, NaN, Infinity, '1']) {
      reject(() => isolated.freeExpand(owned, v));
      reject(() => isolated.adiabaticPiston(owned, v));
    }
    reject(() => isolated.adiabaticPiston(owned, owned.volumeM3 * 100), /envelope/);
    reject(() => isolated.adiabaticPiston(owned, owned.volumeM3 / 100), /envelope/);
    equal(isolated.encode(owned), pin);
  });

  group('canonical codec, actual files, and definition mismatch', () => {
    const stateFile = root + 'chamber-state.json';
    const definitionFile = root + 'definition.json';
    const actual = step('heat', step('adiabaticPiston', mix, 0.075).state, 150);
    writeFileSync(stateFile, thermo.encode(actual.state) + '\n');
    writeFileSync(definitionFile, JSON.stringify(INERT_DEFINITION, null, 2) + '\n');
    const restoredOwner = createThermodynamics(JSON.parse(readFileSync(definitionFile, 'utf8')));
    const restored = restoredOwner.decode(readFileSync(stateFile, 'utf8'));
    equal(restored, actual.state);
    equal(restoredOwner.adiabaticPiston(restored, 0.06), thermo.adiabaticPiston(actual.state, 0.06));
    const shuffled = JSON.parse(JSON.stringify(INERT_DEFINITION));
    shuffled.species.reverse();
    equal(createThermodynamics(shuffled).decode(thermo.encode(mix)), mix);
    const changed = JSON.parse(JSON.stringify(INERT_DEFINITION));
    changed.species[0].cvJPerKgK *= 1.001;
    reject(() => createThermodynamics(changed).decode(thermo.encode(mix)), /definition\/version mismatch/);
    changed.species[0].cvJPerKgK = INERT_DEFINITION.species[0].cvJPerKgK;
    changed.version += '-changed';
    reject(() => createThermodynamics(changed).decode(thermo.encode(mix)), /definition\/version mismatch/);
    reject(() => thermo.decode('{broken JSON'));
    reject(() => thermo.decode(JSON.stringify({ ...mix, temperatureK: 300 })), /unsupported or missing/);
    reject(() => thermo.decode(JSON.stringify({ ...mix, speciesMassesKg: [...mix.speciesMassesKg, mix.speciesMassesKg[0]] })));
    const sameCountDuplicate = { ...mix, speciesMassesKg: [mix.speciesMassesKg[0], mix.speciesMassesKg[0]] };
    reject(() => thermo.decode(JSON.stringify(sameCountDuplicate)), /duplicate/);
    errors.actual_files = Object.fromEntries(['chamber-state.json', 'definition.json'].map((file) => [file, {
      bytes: readFileSync(root + file).length,
      sha256: createHash('sha256').update(readFileSync(root + file)).digest('hex'),
    }]));
  });

  group('invalid quantities/definitions and finite derived envelope', () => {
    const raw = { speciesMassesKg: masses(1), volumeM3: 0.0264, internalEnergyJ: 2.5 * R * 320 };
    for (const field of ['volumeM3', 'internalEnergyJ'])
      for (const bad of [0, -1, NaN, Infinity, -Infinity, '1'])
        reject(() => thermo.create({ ...raw, [field]: bad }));
    for (const bad of [0, -1, NaN, Infinity, '1'])
      reject(() => thermo.create({ ...raw, speciesMassesKg: [{ id: 'inert-air', massKg: bad }] }));
    reject(() => thermo.create({ ...raw, speciesMassesKg: [] }));
    reject(() => thermo.create({ ...raw, speciesMassesKg: [{ id: 'unknown', massKg: 1 }] }));
    reject(() => thermo.create({ ...raw, internalEnergyJ: 2.5 * R * 199 }), /envelope/);
    reject(() => thermo.create({ ...raw, internalEnergyJ: 2.5 * R * 601 }), /envelope/);
    reject(() => thermo.create({ ...raw, volumeM3: Number.MIN_VALUE }), /pressure/);
    const overflow = JSON.parse(JSON.stringify(INERT_DEFINITION));
    overflow.species[0].cvJPerKgK = Number.MIN_VALUE;
    reject(() => createThermodynamics(overflow), /capacity ratio/);
    const convention = { ...INERT_DEFINITION, energyConvention: 'enthalpy-is-U' };
    reject(() => createThermodynamics(convention), /energy convention/);
    for (const key of ['molarMassKgPerMol', 'cvJPerKgK', 'minTemperatureK', 'maxTemperatureK']) {
      const bad = JSON.parse(JSON.stringify(INERT_DEFINITION));
      bad.species[0][key] = Infinity;
      reject(() => createThermodynamics(bad), /finite/);
    }
    const envelope = JSON.parse(JSON.stringify(INERT_DEFINITION));
    envelope.species[0].minTemperatureK = 700;
    reject(() => createThermodynamics(envelope), /empty temperature envelope/);
  });

  const cpu = process.cpuUsage(cpuStart);
  const result = {
    status: 'pass', sourcePins, groups, assertions, operations, rejections, errors,
    wallSeconds: (performance.now() - wallStart) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6,
    rssBytes: process.memoryUsage().rss,
    notes: ['Algebraic thermodynamics qualification, not throughput benchmark.',
      'No spatial solver, finite-reservoir exchange, 3D gas, oxygen, fire or digging implementation.'],
  };
  assert(result.wallSeconds < 10, 'focused proof exceeds 10 s budget');
  writeFileSync(root + 'qualification-v1.json', JSON.stringify(result, null, 2) + '\n');
  writeFileSync(root + 'source-inventory.json', JSON.stringify(sourcePins, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, groups: groups.length, assertions, operations, rejections,
    wallSeconds: result.wallSeconds, cpuSeconds: result.cpuSeconds, rssBytes: result.rssBytes }));
} catch (error) {
  writeFileSync(root + 'qualification-v1-failed.json', JSON.stringify({ status: 'fail', sourcePins, groups,
    assertions, operations, rejections, errors, error: error.stack }, null, 2) + '\n');
  throw error;
}
