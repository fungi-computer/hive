const BLOCK_RECORDING_PATH = "/study-evidence/soil-water/dt3-cells.json";
const EXCAVATION_RECORDING_PATHS = Object.freeze({
  proof: "/study-evidence/soil-water/excavation/proof.json",
  moving: "/study-evidence/soil-water/excavation/moving-frames.json",
  excavated: "/study-evidence/soil-water/excavation/excavated.json",
});

export const SOIL_RECORDING_CASES = Object.freeze([
  {
    id: "block",
    label: "3×3×3 block",
    description: "Recorded nonlinear soil block",
  },
  {
    id: "excavation",
    label: "Unlined excavation",
    description: "Recorded vented pit seepage",
  },
]);

export const DEPTHS = Object.freeze([
  { id: "top", voxelY: -1, label: "Top / pond port" },
  { id: "middle", voxelY: -2, label: "Middle / low-K layer" },
  { id: "lower", voxelY: -3, label: "Lower layer" },
]);

function finite(value, label) {
  if (!Number.isFinite(value))
    throw new Error(`Soil recording ${label} is not finite`);
  return value;
}

function vector(frame, field, length) {
  if (!Array.isArray(frame[field]) || frame[field].length !== length) {
    throw new Error(`Soil recording ${field} does not match the cell count`);
  }
  for (const value of frame[field]) finite(value, field);
  return frame[field];
}

function stableCells(cells) {
  if (!Array.isArray(cells) || cells.length !== 27) {
    throw new Error("Expected the recorded 3×3×3 soil cells");
  }
  const byVoxel = new Map();
  for (const [index, cell] of cells.entries()) {
    if (!Array.isArray(cell.voxel) || cell.voxel.length !== 3) {
      throw new Error("Recorded soil cell needs a voxel coordinate");
    }
    if (!cell.voxel.every(Number.isInteger) || !cell.nodeId) {
      throw new Error("Recorded soil cell identity is invalid");
    }
    const key = cell.voxel.join(",");
    if (byVoxel.has(key))
      throw new Error("Recorded soil voxels must be unique");
    byVoxel.set(key, { ...cell, index });
  }
  return byVoxel;
}

export function decodeRecording(raw) {
  if (raw?.schema !== "soil-block-physical-recording-v1") {
    throw new Error("Expected a soil-block-physical-recording-v1 recording");
  }
  if (raw.units !== "metres-seconds-kilograms" || !raw.sourceIdentity) {
    throw new Error("Expected recording units and source identity");
  }
  const cellsByVoxel = stableCells(raw.cells);
  if (!Array.isArray(raw.frames) || raw.frames.length !== 201) {
    throw new Error("Expected exactly 201 recorded soil frames");
  }
  for (const [frameIndex, frame] of raw.frames.entries()) {
    if (frame.timeS !== frameIndex * 3) {
      throw new Error(
        "Recorded soil clocks must be consecutive 3-second samples",
      );
    }
    if (finite(frame.pondMassKg, "pond mass") < 0) {
      throw new Error("Recorded pond mass must be nonnegative");
    }
    for (const field of ["massKg", "theta", "poreAirM3"]) {
      vector(frame, field, raw.cells.length);
    }
    if (frame.poreAirM3.some((value) => value < 0)) {
      throw new Error("Recorded pore void capacity must be nonnegative");
    }
    if (frame.netFaceTransferKg !== null) {
      vector(frame, "netFaceTransferKg", raw.cells.length);
    }
  }
  const center = cellsByVoxel.get("0,-1,0");
  if (!center) throw new Error("Recorded top-centre pond cell is missing");
  return Object.freeze({
    ...raw,
    kind: "block",
    cellsByVoxel,
    topCenter: center,
  });
}

function excavationCellId(at) {
  return `cell:${at.join(",")}`;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Expected excavation ${label}`);
  return value;
}

function excavationFrameCells(cells, expectedCells, label) {
  if (cells.length !== expectedCells.length) {
    throw new Error(`Excavation ${label} does not match the saved cell set`);
  }
  const expectedById = new Map(expectedCells.map((cell) => [cell.id, cell]));
  const byId = new Map();
  for (const cell of cells) {
    const expected = expectedById.get(cell.id);
    if (
      !expected ||
      cell.kind !== expected.kind ||
      !Array.isArray(cell.at) ||
      cell.at.join(",") !== expected.at.join(",") ||
      byId.has(cell.id)
    ) {
      throw new Error(`Excavation ${label} changes saved cell identity`);
    }
    if (finite(cell.massKg, `${label} mass`) < 0) {
      throw new Error(`Excavation ${label} has negative water mass`);
    }
    if (cell.kind === "pit" && finite(cell.depthM, `${label} depth`) < 0) {
      throw new Error(`Excavation ${label} has negative pit depth`);
    }
    byId.set(cell.id, Object.freeze({ ...cell }));
  }
  return Object.freeze(expectedCells.map(({ id }) => byId.get(id)));
}

function excavationEvidence(proof, moving) {
  const group = proof?.groups?.[3];
  if (
    !proof?.inventory ||
    proof.checks !== 682 ||
    group?.recordingFrames !== moving.frames.length ||
    !Array.isArray(group.flow?.values) ||
    group.flow.values.length !== 5 ||
    group.flow.values.filter((entry) => entry.role === "side").length !== 4 ||
    group.flow.values.filter((entry) => entry.role === "floor").length !== 1
  ) {
    throw new Error("Excavation proof does not match the saved seepage record");
  }
  for (const entry of group.flow.values) finite(entry.outwardKg, "proof flow");
  for (const [label, value] of Object.entries({
    restartPitKg: group.restartPitKg,
    residualKg: group.balance?.residualKg,
    matrixBuilds: group.work?.matrixBuilds,
    matrixUpdates: group.work?.matrixUpdates,
    mixedResidualKg: group.residualMaxima?.mixedKg,
  })) {
    finite(value, `proof ${label}`);
  }
  return Object.freeze({
    checks: group.checks,
    flow: Object.freeze({
      values: Object.freeze(
        group.flow.values.map((entry) => Object.freeze({ ...entry })),
      ),
      floorKg: group.flow.floorKg,
      sidesKg: group.flow.sidesKg,
    }),
    balance: Object.freeze({ ...group.balance }),
    restartPitKg: group.restartPitKg,
    work: Object.freeze({ ...group.work }),
    residualMaxima: Object.freeze({ ...group.residualMaxima }),
  });
}

export function decodeExcavationRecording({ excavated, moving, proof }) {
  if (excavated?.version !== "one-vented-soil-excavation-with-finite-pit-v1") {
    throw new Error("Expected the accepted vented excavation recording");
  }
  if (
    excavated.soilState?.version !== "rigid-richards-connected-volume-be-v1" ||
    excavated.soilState.timeS !== 0 ||
    excavated.soilState.steps !== 0 ||
    moving?.units?.mass !== "kg" ||
    moving.units?.depth !== "m"
  ) {
    throw new Error("Excavation recording has an invalid initial checkpoint");
  }
  const soil = requireArray(excavated.soilGeometry?.cells, "soil cells");
  const reservoirs = requireArray(
    excavated.soilGeometry?.reservoirs,
    "reservoirs",
  );
  const pit = reservoirs.find(
    (entry) => entry.id === "excavation-pit" && entry.kind === "vented-pit",
  );
  if (!pit || reservoirs.length !== 1 || !Array.isArray(pit.at)) {
    throw new Error("Excavation recording needs its one saved vented pit");
  }
  const exportEntry = excavated.exports?.find(
    (entry) => entry.id === "wet-spoil:first-wet-soil-cut",
  );
  if (!exportEntry || finite(exportEntry.waterKg, "wet-spoil export") < 0) {
    throw new Error("Excavation recording needs its saved wet-spoil export");
  }
  const expectedCells = Object.freeze([
    ...soil.map((cell) => {
      if (!Array.isArray(cell.at) || cell.at.length !== 3) {
        throw new Error("Excavation soil cell needs a saved coordinate");
      }
      return Object.freeze({
        id: excavationCellId(cell.at),
        kind: "soil",
        at: Object.freeze([...cell.at]),
      });
    }),
    Object.freeze({
      id: "reservoir:excavation-pit",
      kind: "pit",
      at: Object.freeze([...pit.at]),
    }),
  ]);
  if (
    new Set(expectedCells.map((cell) => cell.id)).size !== expectedCells.length
  ) {
    throw new Error("Excavation recording has duplicate cell identity");
  }
  const initialMass = requireArray(excavated.soilState.massKg, "initial mass");
  if (initialMass.length !== expectedCells.length) {
    throw new Error("Excavation initial state does not match saved geometry");
  }
  const initialCells = excavationFrameCells(
    expectedCells.map((cell, index) => ({
      ...cell,
      massKg: initialMass[index],
      ...(cell.kind === "pit" ? { depthM: 0 } : {}),
    })),
    expectedCells,
    "initial frame",
  );
  const initialPit = initialCells.find((cell) => cell.kind === "pit");
  if (initialPit.massKg !== 0 || initialPit.depthM !== 0) {
    throw new Error("Excavation initial pit must be the actual dry cut");
  }
  const movingFrames = requireArray(moving.frames, "moving frames");
  if (movingFrames.length !== 100 || !Array.isArray(moving.faceIds)) {
    throw new Error("Expected the 100 accepted excavation frames");
  }
  const frames = [Object.freeze({ timeS: 0, cells: initialCells })];
  for (const [index, frame] of movingFrames.entries()) {
    if (frame.timeS !== (index + 1) * 6) {
      throw new Error("Excavation clocks must be consecutive 6-second samples");
    }
    const cells = excavationFrameCells(
      requireArray(frame.cells, "moving frame cells"),
      expectedCells,
      "moving frame",
    );
    vector(frame, "faceTransferKg", moving.faceIds.length);
    frames.push(Object.freeze({ timeS: frame.timeS, cells }));
  }
  const evidence = excavationEvidence(proof, moving);
  if (
    moving.exportedWaterKg !== exportEntry.waterKg ||
    evidence.balance.exportWaterKg !== exportEntry.waterKg
  ) {
    throw new Error(
      "Excavation export differs between accepted record artifacts",
    );
  }
  const finalPit = frames.at(-1).cells.find((cell) => cell.kind === "pit");
  if (finalPit.massKg !== evidence.balance.pitWaterKg) {
    throw new Error(
      "Excavation endpoint differs from the proof-backed pit mass",
    );
  }
  return Object.freeze({
    kind: "excavation",
    title: "Unlined excavation seepage",
    frames: Object.freeze(frames),
    cells: expectedCells,
    depths: Object.freeze(
      [...new Set(expectedCells.map((cell) => cell.at[1]))].sort(
        (left, right) => right - left,
      ),
    ),
    pitId: initialPit.id,
    wetSpoilKg: exportEntry.waterKg,
    evidence,
  });
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok)
    throw new Error(`Could not load recorded soil data: ${path}`);
  return response.json();
}

export async function loadRecording() {
  return decodeRecording(await loadJson(BLOCK_RECORDING_PATH));
}

export async function loadRecordings() {
  const [block, excavated, moving, proof] = await Promise.all([
    loadRecording(),
    loadJson(EXCAVATION_RECORDING_PATHS.excavated),
    loadJson(EXCAVATION_RECORDING_PATHS.moving),
    loadJson(EXCAVATION_RECORDING_PATHS.proof),
  ]);
  return Object.freeze({
    block,
    excavation: decodeExcavationRecording({ excavated, moving, proof }),
  });
}

export function frameFacts(recording, frameIndex) {
  const frame = recording.frames[frameIndex];
  if (!frame) throw new Error(`No recorded soil frame ${frameIndex}`);
  const initial = recording.frames[0];
  const centerIndex = recording.topCenter.index;
  return Object.freeze({
    frameIndex,
    timeS: frame.timeS,
    pondMassKg: frame.pondMassKg,
    center: Object.freeze({
      voxel: recording.topCenter.voxel,
      massKg: frame.massKg[centerIndex],
      massChangeKg: frame.massKg[centerIndex] - initial.massKg[centerIndex],
      theta: frame.theta[centerIndex],
      poreAirM3: frame.poreAirM3[centerIndex],
    }),
  });
}

export function changeScale(recording) {
  const initial = recording.frames[0];
  let maximum = 0;
  for (const frame of recording.frames) {
    for (const [index, massKg] of frame.massKg.entries()) {
      maximum = Math.max(maximum, Math.abs(massKg - initial.massKg[index]));
    }
  }
  return maximum;
}

export function voxelKey(voxel) {
  return voxel.join(",");
}

export function depthSlice(recording, frameIndex, voxelY) {
  const frame = recording.frames[frameIndex];
  if (!frame) throw new Error(`No recorded soil frame ${frameIndex}`);
  const initial = recording.frames[0];
  const cells = [...recording.cellsByVoxel.values()]
    .filter((cell) => cell.voxel[1] === voxelY)
    .sort(
      (left, right) =>
        left.voxel[2] - right.voxel[2] || left.voxel[0] - right.voxel[0],
    );
  if (cells.length !== 9)
    throw new Error("Recorded depth must contain nine cells");
  return cells.map((cell) =>
    Object.freeze({
      cell,
      massKg: frame.massKg[cell.index],
      massChangeKg: frame.massKg[cell.index] - initial.massKg[cell.index],
      theta: frame.theta[cell.index],
      poreAirM3: frame.poreAirM3[cell.index],
    }),
  );
}

export function depthCenterSliceEntry(recording, frameIndex, voxelY) {
  const entry = depthSlice(recording, frameIndex, voxelY).find(
    ({ cell }) => cell.voxel[0] === 0 && cell.voxel[2] === 0,
  );
  if (!entry) throw new Error("Recorded depth has no selectable centre cell");
  return entry;
}
