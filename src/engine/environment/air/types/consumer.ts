import {
  createAir,
  type AirCellId,
  type AirDefinition,
  type AirInitialInput,
  type AirRebindReceipt,
} from "../index.js";

const definition = {
  version: "voxel-air-definition-v1",
  regionId: "typed-room",
  revision: 0,
  origin: [0, 0, 0],
  size: [2, 2, 2],
  spacingM: [1, 0.54, 1],
  solidCells: [],
  closedFaces: [],
  openSides: [],
  model: {
    densityKgM3: 1.2,
    heatCapacityJKgK: 1005,
    referenceTemperatureK: 293.15,
    gravityMSS: 9.81,
    viscosityM2S: 1.5e-5,
    thermalDiffusivityM2S: 2.2e-5,
    tracerDiffusivityM2S: 1e-5,
  },
} satisfies AirDefinition;

/** Compile-only consumer: region initialization, observable stock totals,
 * requested source/advance, opening edit and current-format reopen.
 */
function consume(input: AirInitialInput, externalDefinition: unknown) {
  const air = createAir(definition);
  const admitted = createAir(externalDefinition).definition;
  const state = air.initial(input);
  const next = air.advance(state, 0.2, {
    sources: [{ cellId: "cell:0,0,0", smokeKgS: 1e-6, heatJS: 30 }],
    maxSteps: 8,
    maxTrials: 16,
    maxProjectionIterations: 256,
  });
  const facts = air.read(next.state);
  const stockKg: number = facts.cells.reduce((total, cell) => {
    const heightM: number = (cell.at[1] + 0.5) * air.definition.spacingM[1];
    // @ts-expect-error Facts do not have a renderer opacity or a catch-all any.
    cell.opacity;
    // @ts-expect-error Returned physical quantities are numbers, not strings.
    const badVolume: string = cell.volumeM3;
    void badVolume;
    return total + (heightM >= 0 ? cell.smokeKg : 0);
  }, 0);
  const outsideFlowMPS = facts.faces.reduce((total, face) => {
    const destination: AirCellId | null = face.rightCellId;
    return total + (destination === null ? face.velocityMPS : 0);
  }, 0);
  const sourceKg: number = next.receipt.balance.totalSourceSmokeKg;
  const faceM3: number = next.receipt.airM3.reduce(
    (total, amount) => total + amount,
    0,
  );
  const evaluatedFaces: number = next.work.scalarFaceEvaluations;
  const rebound = air.rebind(next.state, {
    ...air.definition,
    revision: 1,
    openSides: ["x+"],
  } satisfies AirDefinition);
  if (rebound.status === "blocked") {
    // @ts-expect-error An expected blockage contains no proposed field state.
    rebound.state;
    return { blocked: rebound.reason };
  }
  const kineticChange: AirRebindReceipt["kineticChangeJ"] =
    rebound.receipt.kineticChangeJ;
  const reopened = createAir(rebound.definition);
  reopened.read(reopened.decode(reopened.encode(rebound.state)));
  const edited = reopened.rebind(rebound.state, {
    ...reopened.definition,
    revision: 2,
    solidCells: ["cell:0,0,0"],
  } satisfies AirDefinition);
  if (edited.status === "blocked") return { blocked: edited.reason };
  const exportedM3: number = edited.receipt.airExportM3;
  for (const crossing of edited.receipt.boundaryCrossings) {
    const direction: "import" | "export" = crossing.direction;
    // @ts-expect-error Private displacement paths are not saved/public history.
    crossing.path;
    void direction;
  }

  // @ts-expect-error No pressure-in-Pascals state is exposed by this approximation.
  facts.pressurePa;
  // @ts-expect-error State is readonly; the consumer cannot mutate canonical stock.
  state.smokeKg[0] = 1;
  // @ts-expect-error Callback-driven sources are not a supported operation.
  air.advance(state, 0.2, { sources: () => [] });
  // @ts-expect-error The timestep is a number in seconds.
  air.advance(state, 0.2, { dtMaxS: "fast" });
  // @ts-expect-error The internal halving bound is not a caller option.
  air.advance(state, 0.2, { maxHalvings: 100 });
  air.advance(state, 0.2, {
    // @ts-expect-error Source rates use heatJS, not a stock amount heatJ.
    sources: [{ cellId: "cell:0,0,0", smokeKgS: 0, heatJ: 30 }],
  });
  // @ts-expect-error Rebind has projection work options, not a physical timestep.
  air.rebind(state, admitted, { dtMaxS: 0.1 });
  // @ts-expect-error Opening projection does not return scalar transport counters.
  rebound.work.scalarFaceEvaluations;
  // @ts-expect-error No replacement clock/scheduler is part of the API.
  air.tick();
  return {
    stockKg,
    outsideFlowMPS,
    sourceKg,
    faceM3,
    evaluatedFaces,
    kineticChange,
    exportedM3,
  };
}

void consume;
