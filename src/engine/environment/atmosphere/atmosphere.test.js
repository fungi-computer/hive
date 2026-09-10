import assert from "node:assert/strict";
import test from "node:test";
import { createAtmosphere } from "./index.ts";
import { compileAtmosphere, updateAtmosphereGeometry } from "./definition.ts";

const ambient = { pressurePa: 100_000, temperatureK: 300 };
const model = {
  specificGasConstantJKgK: 250,
  heatCapacityJKgK: 1000,
  mixingVelocityMPS: 0.02,
  buoyancyVelocityMPSK: 0.001,
  pressureVelocityMPSPa: 1e-7,
  maxStepS: 0.25,
  maxExchangeFraction: 0.25,
  maxPressureRatio: 1.5,
  maxTemperatureDeltaK: 50,
  maxSmokeMassFraction: 0.02,
};
const member = (cellId, volumeM3 = 1, elevationM = 0.5) => ({
  cellId,
  volumeM3,
  elevationM,
});
const volume = (id, members) => ({ id, members });
const cellByVolume = {
  lower: "cell:0,0,0",
  upper: "cell:0,1,0",
  room: "cell:0,0,0",
  a: "cell:0,0,0",
  b: "cell:1,0,0",
  cut: "cell:0,0,0",
  receiver: "cell:1,0,0",
};
const opening = (id, from, to, elevationM = 1, permeability = 1) => ({
  id,
  from,
  fromCellId: cellByVolume[from],
  to,
  toCellId: to === null ? null : cellByVolume[to],
  areaM2: 1,
  distanceM: 1,
  elevationM,
  permeability,
});
function definition({ volumes, openings = [], revision = 0, override = {} }) {
  return {
    version: "connected-atmosphere-definition-v1",
    regionId: "law-room",
    geometryIdentity: `law-geometry:${revision}`,
    revision,
    ambient,
    model: { ...model, ...override },
    volumes,
    openings,
  };
}
function initial(owner, stocks = {}) {
  const density =
    ambient.pressurePa / (model.specificGasConstantJKgK * ambient.temperatureK);
  return owner.initial(
    owner.definition.volumes.map((entry) => ({
      volumeId: entry.id,
      carrierKg:
        density *
        entry.members.reduce((total, item) => total + item.volumeM3, 0),
      smokeKg: stocks[entry.id]?.smokeKg ?? 0,
      heatJ: stocks[entry.id]?.heatJ ?? 0,
    })),
  );
}

test("state is detached, exact-definition-bound and has no physical clock", () => {
  const owner = createAtmosphere(
      definition({ volumes: [volume("lower", [member("cell:0,0,0")])] }),
    ),
    input = [{ volumeId: "lower", carrierKg: 4 / 3, smokeKg: 0, heatJ: 0 }],
    state = owner.initial(input);
  input[0].carrierKg = 1;
  assert.equal(state.parcels[0].carrierKg, 4 / 3);
  assert.equal("timeS" in state, false);
  assert.equal("steps" in state, false);
  assert.deepEqual(owner.decode(owner.encode(state)), state);
  assert.throws(
    () => owner.decode(JSON.stringify({ ...state, ignored: true })),
    /unrecognized|Unrecognized|invalid/i,
  );
});

test("unknown records are copied without invoking accessors", () => {
  let definitionReads = 0,
    stateReads = 0,
    optionReads = 0;
  const malformedDefinition = { ...definition({ volumes: [] }) };
  Object.defineProperty(malformedDefinition, "volumes", {
    enumerable: true,
    get() {
      definitionReads++;
      return [];
    },
  });
  assert.throws(() => createAtmosphere(malformedDefinition), /record|data/i);
  const owner = createAtmosphere(
      definition({ volumes: [volume("room", [member("cell:0,0,0")])] }),
    ),
    state = initial(owner),
    malformedState = { ...state },
    options = {};
  Object.defineProperty(malformedState, "parcels", {
    enumerable: true,
    get() {
      stateReads++;
      return state.parcels;
    },
  });
  Object.defineProperty(options, "sources", {
    enumerable: true,
    get() {
      optionReads++;
      return [];
    },
  });
  assert.throws(() => owner.read(malformedState), /record|data/i);
  assert.throws(() => owner.advance(state, 1, options), /record|data/i);
  assert.deepEqual([definitionReads, stateReads, optionReads], [0, 0, 0]);
});

test("nonpositive absolute temperature is outside the physical envelope", () => {
  const owner = createAtmosphere(
      definition({
        volumes: [volume("room", [member("cell:0,0,0")])],
        override: { maxTemperatureDeltaK: 1_000 },
      }),
    ),
    state = initial(owner),
    heatJ =
      -state.parcels[0].carrierKg *
      model.heatCapacityJKgK *
      (ambient.temperatureK + 1);
  assert.throws(
    () =>
      owner.read({
        ...state,
        parcels: [{ ...state.parcels[0], heatJ }],
        initialHeatJ: heatJ,
      }),
    /envelope/,
  );
});

test("only declared openings exchange finite smoke and heat", () => {
  const volumes = [
      volume("lower", [member("cell:0,0,0", 1, 0.5)]),
      volume("upper", [member("cell:0,1,0", 1, 1.5)]),
    ],
    sealed = createAtmosphere(definition({ volumes })),
    connected = createAtmosphere(
      definition({
        volumes,
        openings: [opening("y:0,1,0", "lower", "upper")],
      }),
    ),
    sealedAfter = sealed.advance(initial(sealed), 1, {
      sources: [{ volumeId: "lower", smokeKgS: 0.001, heatJS: 10 }],
    }),
    connectedAfter = connected.advance(initial(connected), 1, {
      sources: [{ volumeId: "lower", smokeKgS: 0.001, heatJS: 10 }],
    });
  assert.equal(sealed.read(sealedAfter.state).volumes[1].smokeKg, 0);
  assert.ok(connected.read(connectedAfter.state).volumes[1].smokeKg > 0);
  assert.equal(connectedAfter.receipt.sourceSmokeKg, 0.001);
  assert.equal(connectedAfter.receipt.sourceHeatJ, 10);
});

test("declared ambient openings export smoke and account finite carrier", () => {
  const owner = createAtmosphere(
      definition({
        volumes: [volume("room", [member("cell:0,0,0")])],
        openings: [opening("x:1,0,0:ambient", "room", null)],
      }),
    ),
    before = initial(owner, { room: { smokeKg: 0.001, heatJ: 20 } }),
    result = owner.advance(before, 1);
  assert.ok(result.receipt.smokeBoundaryKg > 0);
  assert.ok(result.receipt.heatBoundaryJ > 0);
  assert.ok(owner.read(result.state).volumes[0].smokeKg < 0.001);
  assert.equal(before.parcels[0].smokeKg, 0.001);
});

test("many valid openings share a bounded exchange budget", () => {
  const owner = createAtmosphere(
      definition({
        volumes: [volume("room", [member("cell:0,0,0")])],
        openings: Array.from({ length: 20 }, (_, index) =>
          opening(`outside:${index}`, "room", null),
        ),
        override: {
          mixingVelocityMPS: 10,
          pressureVelocityMPSPa: 0,
        },
      }),
    ),
    before = initial(owner);
  const result = owner.advance(before, 0.25);
  assert.ok(result.state.parcels[0].carrierKg > 0);
  assert.ok(result.receipt.carrierBoundaryKg >= 0);
});

test("near-equilibrium carrier cannot freeze smoke and heat mixing or leak its opposite endpoint", () => {
  const owner = createAtmosphere(
    definition({
      volumes: [volume("room", [member("cell:0,0,0")])],
      openings: [opening("ambient", "room", null)],
      override: { pressureVelocityMPSPa: 0, buoyancyVelocityMPSK: 0 },
    }),
  );
  const before = owner.initial([
    {
      volumeId: "room",
      carrierKg: 4 / 3 + Number.EPSILON,
      smokeKg: 0.001,
      heatJ: 20,
    },
  ]);
  const { state, receipt } = owner.advance(before, 0.25);
  assert.equal(state.parcels[0].carrierKg, before.parcels[0].carrierKg);
  assert.equal(receipt.carrierBoundaryKg, 0);
  assert(state.parcels[0].smokeKg < before.parcels[0].smokeKg);
  assert(state.parcels[0].heatJ < before.parcels[0].heatJ);
  assert(receipt.smokeBoundaryKg > 0);
  assert(receipt.heatBoundaryJ > 0);
  assert(
    Math.abs(state.parcels[0].smokeKg + receipt.smokeBoundaryKg - 0.001) <
      1e-18,
  );
  assert(Math.abs(state.parcels[0].heatJ + receipt.heatBoundaryJ - 20) < 1e-13);
  assert.deepEqual(owner.decode(owner.encode(state)), state);
});

test("unrepresentable pressure constituent defers the complete paired parcel without partial writes", () => {
  const owner = createAtmosphere(
    definition({
      volumes: [
        volume("a", [member("cell:0,0,0")]),
        volume("b", [member("cell:1,0,0")]),
      ],
      openings: [opening("between", "a", "b")],
      override: { mixingVelocityMPS: 0, buoyancyVelocityMPSK: 0 },
    }),
  );
  const before = owner.initial([
    { volumeId: "a", carrierKg: 1.4, smokeKg: 0.001, heatJ: 1e-16 },
    { volumeId: "b", carrierKg: 4 / 3, smokeKg: 0, heatJ: 20 },
  ]);
  const result = owner.advance(before, 0.25);
  assert.deepEqual(result.state, before);
  assert.equal(result.receipt.carrierBoundaryKg, 0);
  assert.equal(result.receipt.smokeBoundaryKg, 0);
  assert.equal(result.receipt.heatBoundaryJ, 0);
});

test("definition order is not a saved identity or result dependency", () => {
  const volumes = [
      volume("a", [member("cell:0,0,0")]),
      volume("b", [member("cell:1,0,0")]),
    ],
    openings = [opening("x:1,0,0", "a", "b")],
    first = createAtmosphere(definition({ volumes, openings })),
    reversed = createAtmosphere(
      definition({
        volumes: [...volumes].reverse().map((entry) => ({
          ...entry,
          members: [...entry.members].reverse(),
        })),
        openings: [...openings].reverse(),
      }),
    );
  assert.equal(first.identity, reversed.identity);
  assert.deepEqual(first.initial(initial(first).parcels), initial(reversed));
});

test("trapped shrink retains gas and blocks only beyond the pressure envelope", () => {
  const oldDefinition = definition({
      volumes: [volume("pocket", [member("cell:0,0,0")])],
    }),
    owner = createAtmosphere(oldDefinition),
    state = initial(owner, { pocket: { smokeKg: 0.001, heatJ: 20 } }),
    smaller = definition({
      revision: 1,
      volumes: [volume("pocket", [member("cell:0,0,0", 0.8)])],
    }),
    applied = owner.rebind(state, smaller);
  assert.equal(applied.status, "applied");
  assert.equal(applied.state.parcels[0].carrierKg, state.parcels[0].carrierKg);
  assert.equal(applied.state.parcels[0].smokeKg, state.parcels[0].smokeKg);
  assert.equal(applied.receipt.carrierBoundaryKg, 0);

  const nearZero = definition({
    revision: 1,
    volumes: [volume("pocket", [member("cell:0,0,0", 1e-6)])],
  });
  assert.deepEqual(owner.rebind(state, nearZero), {
    status: "blocked",
    reason: "pressure-envelope",
  });
  assert.equal(state.parcels[0].carrierKg, 4 / 3);
});

test("shrink displaces stock only through a face on the changed cell", () => {
  const openings = [opening("outside", "room", null)],
    owner = createAtmosphere(
      definition({
        volumes: [volume("room", [member("cell:0,0,0")])],
        openings,
      }),
    ),
    state = initial(owner, { room: { smokeKg: 0.001, heatJ: 20 } }),
    result = owner.rebind(
      state,
      definition({
        revision: 1,
        volumes: [volume("room", [member("cell:0,0,0", 0.5)])],
        openings,
      }),
    );
  assert.equal(result.status, "applied");
  assert.equal(result.state.parcels[0].smokeKg, 0.0005);
  assert.equal(result.receipt.smokeBoundaryKg, 0.0005);

  const sealedOwner = createAtmosphere(
      definition({
        volumes: [volume("room", [member("cell:0,0,0")])],
        openings: [opening("closed", "room", null, 1, 0)],
      }),
    ),
    sealedState = initial(sealedOwner, {
      room: { smokeKg: 0.001, heatJ: 20 },
    }),
    sealedResult = sealedOwner.rebind(
      sealedState,
      definition({
        revision: 1,
        volumes: [volume("room", [member("cell:0,0,0", 0.8)])],
        openings: [opening("closed", "room", null, 1, 0)],
      }),
    );
  assert.equal(sealedResult.status, "applied");
  assert.equal(sealedResult.state.parcels[0].smokeKg, 0.001);
  assert.equal(sealedResult.receipt.smokeBoundaryKg, 0);
});

test("last-volume displacement needs an old physical route", () => {
  const baseVolumes = [
      volume("cut", [member("cell:0,0,0")]),
      volume("receiver", [member("cell:1,0,0")]),
    ],
    openOwner = createAtmosphere(
      definition({
        volumes: baseVolumes,
        openings: [opening("route", "cut", "receiver")],
        override: { maxPressureRatio: 3 },
      }),
    ),
    closedOwner = createAtmosphere(
      definition({ volumes: baseVolumes, override: { maxPressureRatio: 3 } }),
    ),
    next = definition({
      revision: 1,
      volumes: [volume("receiver", [member("cell:1,0,0")])],
      override: { maxPressureRatio: 3 },
    });
  const routed = openOwner.rebind(initial(openOwner), next);
  assert.equal(routed.status, "applied");
  assert.equal(routed.state.parcels[0].carrierKg, 8 / 3);
  assert.deepEqual(routed.receipt.routedParcels, [
    { fromVolumeId: "cut", toVolumeId: "receiver" },
  ]);
  assert.deepEqual(closedOwner.rebind(initial(closedOwner), next), {
    status: "blocked",
    reason: "trapped-volume-removed",
  });
});

test("sealed vacuum may disappear but even tiny trapped gas retains custody", () => {
  const owner = createAtmosphere(
    definition({
      volumes: [
        volume("cut", [member("cell:0,0,0")]),
        volume("receiver", [member("cell:1,0,0")]),
      ],
    }),
  );
  const next = definition({
    revision: 1,
    volumes: [volume("receiver", [member("cell:1,0,0")])],
  });
  const state = (carrierKg) =>
    owner.initial([
      { volumeId: "cut", carrierKg, smokeKg: 0, heatJ: 0 },
      { volumeId: "receiver", carrierKg: 1, smokeKg: 0, heatJ: 0 },
    ]);
  const vacuum = state(0),
    result = owner.rebind(vacuum, next);
  assert.equal(result.status, "applied");
  assert.equal(result.state.parcels.length, 1);
  assert.equal(result.state.parcels[0].carrierKg, 1);
  assert.equal(result.state.carrierBoundaryKg, 0);
  assert.deepEqual(result.receipt.routedParcels, []);
  assert.equal(vacuum.parcels.length, 2);
  const trace = state(1e-12);
  assert.deepEqual(owner.rebind(trace, next), {
    status: "blocked",
    reason: "trapped-volume-removed",
  });
  assert.equal(
    trace.parcels.find((parcel) => parcel.volumeId === "cut").carrierKg,
    1e-12,
  );
});

test("new space starts empty and fills gradually through elapsed face exchange", () => {
  const owner = createAtmosphere(
      definition({ volumes: [volume("a", [member("cell:0,0,0")])] }),
    ),
    state = initial(owner, { a: { smokeKg: 0.001, heatJ: 20 } }),
    connected = definition({
      revision: 1,
      volumes: [
        volume("a", [member("cell:0,0,0")]),
        volume("b", [member("cell:1,0,0", 0.25)]),
      ],
      openings: [opening("x:1,0,0", "a", "b")],
    }),
    result = owner.rebind(state, connected);
  assert.equal(result.status, "applied");
  assert.equal(
    result.state.parcels.reduce((total, entry) => total + entry.smokeKg, 0),
    state.parcels[0].smokeKg,
  );
  assert.equal(
    result.state.parcels.find((entry) => entry.volumeId === "b").carrierKg,
    0,
  );
  const connectedOwner = createAtmosphere(connected),
    admitted = [
      result.state.parcels.find((entry) => entry.volumeId === "b").carrierKg,
    ];
  let after = result.state;
  for (let count = 0; count < 4; count++) {
    after = connectedOwner.advance(after, 0.25).state;
    admitted.push(
      after.parcels.find((entry) => entry.volumeId === "b").carrierKg,
    );
  }
  assert(
    admitted.every(
      (amount, index) => index === 0 || amount > admitted[index - 1],
    ),
  );
  // Binary floating-point transfer may leave an ulp-scale ledger residual.
  assert(
    Math.abs(connectedOwner.read(after).balance.carrierKg) <=
      Number.EPSILON * state.initialCarrierKg,
  );

  const isolated = definition({
    revision: 1,
    volumes: [
      volume("a", [member("cell:0,0,0")]),
      volume("b", [member("cell:1,0,0", 0.25)]),
    ],
  });
  const isolatedResult = owner.rebind(state, isolated);
  assert.equal(isolatedResult.status, "applied");
  assert.equal(
    isolatedResult.state.parcels.find((entry) => entry.volumeId === "b")
      .carrierKg,
    0,
  );
});

test("admission is exact-object and compiled-owner local, with detached cold inputs", async () => {
  const { compileAtmosphere } = await import("./definition.ts");
  const { initialState, validateState } = await import("./state.ts");
  const config = definition({
    volumes: [volume("room", [member("cell:0,0,0")])],
  });
  const first = compileAtmosphere(config),
    second = compileAtmosphere(config);
  const state = initialState(first, [
    { volumeId: "room", carrierKg: 4 / 3, smokeKg: 0, heatJ: 0 },
  ]);
  assert.equal(
    validateState(first, state),
    state,
    "same admitted immutable object is reused",
  );
  const foreign = validateState(second, state);
  assert.notEqual(
    foreign,
    state,
    "matching definition text does not share admission",
  );
  assert.deepEqual(foreign, state);
  assert.equal(validateState(second, foreign), foreign);
  const copied = structuredClone(state);
  const cold = validateState(first, copied);
  assert.notEqual(cold, copied);
  assert(
    Object.isFrozen(cold) &&
      Object.isFrozen(cold.parcels) &&
      Object.isFrozen(cold.parcels[0]),
  );
  copied.smokeSourceKg = 1;
  assert.throws(() => validateState(first, copied), /balance/);
  assert.equal(validateState(first, cold), cold);
  assert.throws(() => {
    cold.parcels[0].heatJ = 1;
  }, TypeError);
  let invoked = false;
  const forged = { ...state };
  Object.defineProperty(forged, "identity", {
    enumerable: true,
    get() {
      invoked = true;
      return state.identity;
    },
  });
  assert.throws(() => validateState(first, forged));
  assert.equal(invoked, false);
});

test("warm and cold operations agree while new candidates retain envelope and ledger checks", async () => {
  const { compileAtmosphere } = await import("./definition.ts");
  const { initialState, publishCandidateState, validateState } =
    await import("./state.ts");
  const config = definition({
    volumes: [volume("room", [member("cell:0,0,0")])],
  });
  const owner = createAtmosphere(config),
    state = initial(owner);
  const options = {
    sources: [{ volumeId: "room", smokeKgS: 0.001, heatJS: 1 }],
  };
  const warm = owner.advance(state, 0.25, options),
    cold = owner.advance(structuredClone(state), 0.25, options);
  assert.deepEqual(warm, cold);
  assert.deepEqual(
    owner.read(warm.state),
    owner.read(owner.decode(owner.encode(warm.state))),
  );
  const g = compileAtmosphere(config);
  const admitted = initialState(g, [
    { volumeId: "room", carrierKg: 4 / 3, smokeKg: 0, heatJ: 0 },
  ]);
  const invalid = structuredClone(admitted);
  invalid.parcels[0].smokeKg = 1;
  invalid.smokeSourceKg = 1;
  assert.throws(() => publishCandidateState(g, invalid), /envelope/);
  invalid.parcels[0].smokeKg = 0;
  assert.throws(() => publishCandidateState(g, invalid), /balance/);
  assert.equal(validateState(g, admitted), admitted);
});

test("rebound state belongs to its next definition, never the previous owner", () => {
  const config = definition({
    volumes: [volume("room", [member("cell:0,0,0")])],
  });
  const owner = createAtmosphere(config),
    state = initial(owner);
  const next = { ...config, revision: 1, geometryIdentity: "law-geometry:1" };
  const rebound = owner.rebind(state, next);
  assert.equal(rebound.status, "applied");
  assert.throws(() => owner.read(rebound.state), /identity/);
  const successor = createAtmosphere(next);
  assert.deepEqual(
    successor.read(rebound.state),
    successor.read(successor.decode(successor.encode(rebound.state))),
  );
  assert.deepEqual(owner.read(state).balance, {
    carrierKg: 0,
    smokeKg: 0,
    heatJ: 0,
  });
});

test("metric successor retains topology and admits only its canonical compiled definition", () => {
  const before = compileAtmosphere(
    definition({
      volumes: [
        volume("a", [member("cell:0,0,0")]),
        volume("b", [member("cell:1,0,0")]),
      ],
      openings: [opening("door", "a", "b")],
    }),
  );
  const delta = {
    geometryIdentity: "metrics:1",
    revision: 1,
    memberVolumes: [{ volumeId: "a", cellId: "cell:0,0,0", volumeM3: 0.9 }],
    openingAreas: [{ openingId: "door", areaM2: 0.8 }],
  };
  const next = updateAtmosphereGeometry(before, delta);
  assert.strictEqual(next.cellOwner, before.cellOwner);
  assert.strictEqual(next.volumeIndex, before.volumeIndex);
  assert.strictEqual(next.openingIndex, before.openingIndex);
  assert.strictEqual(next.volumes[1], before.volumes[1]);
  assert.strictEqual(next.volumeById.get("a"), next.volumes[0]);
  assert.equal(next.volumes[0].volumeM3, 0.9);
  assert.equal(next.openings[0].areaM2, 0.8);
  assert.strictEqual(compileAtmosphere(next.definition), next);
  const cold = compileAtmosphere(structuredClone(next.definition));
  assert.notStrictEqual(cold, next);
  assert.equal(cold.identity, next.identity);
  assert.deepEqual(cold.volumes, next.volumes);
  assert.throws(
    () =>
      updateAtmosphereGeometry(before, {
        ...delta,
        memberVolumes: [{ volumeId: "b", cellId: "cell:0,0,0", volumeM3: 1 }],
      }),
    /belongs|unknown/,
  );
  assert.throws(
    () =>
      updateAtmosphereGeometry(before, {
        ...delta,
        memberVolumes: [...delta.memberVolumes, ...delta.memberVolumes],
      }),
    /duplicate/,
  );
  assert.throws(() =>
    updateAtmosphereGeometry(before, {
      ...delta,
      openingAreas: [{ openingId: "door", areaM2: 0 }],
    }),
  );
  const bad = structuredClone(next.definition);
  bad.openings[0].fromCellId = "missing";
  assert.throws(() => compileAtmosphere(bad), /endpoints/);
  const owner = createAtmosphere(before.definition);
  const successor = createAtmosphere(next.definition);
  const rebound = owner.rebind(initial(owner), next.definition);
  assert.equal(rebound.status, "applied");
  assert.strictEqual(successor.admit(rebound.state), rebound.state);
  assert.deepEqual(
    successor.decode(successor.encode(rebound.state)),
    rebound.state,
  );
});
