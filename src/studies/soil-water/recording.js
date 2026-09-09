const RECORDING_PATH = "/study-evidence/soil-water/dt3-cells.json";

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
    cellsByVoxel,
    topCenter: center,
  });
}

export async function loadRecording() {
  const response = await fetch(RECORDING_PATH);
  if (!response.ok) throw new Error("Could not load the recorded soil block");
  return decodeRecording(await response.json());
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
