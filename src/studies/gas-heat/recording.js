const RECORDING_PATHS = Object.freeze({
  sealed: "/study-evidence/gas-heat/sealed.json",
  ports: "/study-evidence/gas-heat/ports.json",
});

export const RECORDED_SLICE_Z = 2;

function finite(value, label) {
  if (!Number.isFinite(value))
    throw new Error(`Gas recording ${label} is not finite`);
  return value;
}

function positiveFinite(value, label) {
  finite(value, label);
  if (value <= 0) throw new Error(`Gas recording ${label} must be positive`);
  return value;
}

function range(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    finite(value, "field value");
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function consecutiveCells(cells) {
  const byIndex = Array(cells.length);
  for (const cell of cells) {
    const index = cell?.i;
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) {
      throw new Error("Recorded cell index is outside the geometry");
    }
    if (byIndex[index]) throw new Error("Recorded cell indices must be unique");
    byIndex[index] = cell;
  }
  if (byIndex.some((cell) => !cell)) {
    throw new Error("Recorded cell indices must be consecutive");
  }
  return byIndex;
}

function validSolidIndices(indices, cellsByIndex) {
  if (!Array.isArray(indices)) {
    throw new Error("Recorded geometry requires solid cell indices");
  }
  const solids = new Set();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= cellsByIndex.length) {
      throw new Error("Recorded solid index is outside the geometry");
    }
    if (solids.has(index))
      throw new Error("Recorded solid indices must be unique");
    if (cellsByIndex[index].fluid !== false) {
      throw new Error("Recorded solid index must point at a solid cell");
    }
    solids.add(index);
  }
  if (cellsByIndex.some((cell, index) => cell.fluid === solids.has(index))) {
    throw new Error("Recorded solid mask must agree with the recorded cells");
  }
  return solids;
}

export function kelvinForHeat(recording, heatJ) {
  const { rhoKgM3, cpJKgK, referenceKelvin } = recording.constants;
  return referenceKelvin + heatJ / (rhoKgM3 * cpJKgK * recording.cellVolumeM3);
}

export function concentrationMgM3(recording, tracerKg) {
  return (tracerKg / recording.cellVolumeM3) * 1e6;
}

function unitFraction(value, scale) {
  if (scale.max <= scale.min) return 0;
  return Math.max(
    0,
    Math.min(1, (value - scale.min) / (scale.max - scale.min)),
  );
}

export function decodeRecording(raw, requestedCaseId) {
  if (raw?.format !== "gas-visual-recording-v1") {
    throw new Error("Expected a gas-visual-recording-v1 recording");
  }
  if (!Object.hasOwn(RECORDING_PATHS, raw.case)) {
    throw new Error("Expected a known recorded gas case");
  }
  if (requestedCaseId && raw.case !== requestedCaseId) {
    throw new Error("Requested gas case does not match the recording case");
  }
  if (!Array.isArray(raw.frames) || raw.frames.length !== 46) {
    throw new Error("Expected exactly 46 recorded gas frames");
  }
  const size = raw.geometry?.size;
  const cells = raw.geometry?.cells;
  if (
    !Array.isArray(size) ||
    size.join(",") !== "8,10,6" ||
    !Array.isArray(cells)
  ) {
    throw new Error("Expected the recorded 8×10×6 gas geometry");
  }
  const cellVolumeM3 = positiveFinite(
    raw.geometry.metric?.volume,
    "cell volume",
  );
  const constants = raw.constants;
  positiveFinite(constants?.rhoKgM3, "density");
  positiveFinite(constants?.cpJKgK, "specific heat");
  finite(constants?.referenceKelvin, "reference temperature");
  const cellCount = cells.length;
  if (cellCount !== 480) throw new Error("Expected 480 recorded gas cells");
  const cellsByIndex = consecutiveCells(cells);
  const solidCellIndices = validSolidIndices(
    raw.geometry.solidCellIndices,
    cellsByIndex,
  );
  const faces = raw.geometry.faces;
  if (!Array.isArray(faces))
    throw new Error("Recorded geometry requires faces");
  for (const [frameIndex, frame] of raw.frames.entries()) {
    if (frame.timeSeconds !== frameIndex) {
      throw new Error(
        "Recorded clocks must be consecutive seconds from 0 through 45",
      );
    }
    for (const field of ["tracerKg", "heatJ"]) {
      if (frame[field]?.length !== cellCount) {
        throw new Error(`Recorded ${field} length does not match the geometry`);
      }
      for (const value of frame[field]) finite(value, field);
    }
    if (frame.faceVelocityMS?.length !== faces.length) {
      throw new Error(
        "Recorded face velocity length does not match geometry faces",
      );
    }
    for (const value of frame.faceVelocityMS) finite(value, "face velocity");
    for (const index of solidCellIndices) {
      if (frame.heatJ[index] !== 0 || frame.tracerKg[index] !== 0) {
        throw new Error(
          "Recorded solids must not contain heat or tracer stock",
        );
      }
    }
  }
  return Object.freeze({
    ...raw,
    cellVolumeM3,
    cellsByIndex: Object.freeze(cellsByIndex),
  });
}

export async function loadRecording(caseId) {
  const path = RECORDING_PATHS[caseId];
  if (!path) throw new Error(`Unknown gas recording case: ${caseId}`);
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${caseId} recording`);
  return decodeRecording(await response.json(), caseId);
}

export function deriveFixedScales(recordings) {
  let kelvinMax = -Infinity;
  let tracerMgM3Max = 0;
  let speedAbsMax = 0;
  let kelvinMin = Infinity;
  for (const recording of recordings) {
    for (const frame of recording.frames) {
      for (const heatJ of frame.heatJ) {
        const kelvin = kelvinForHeat(recording, heatJ);
        kelvinMin = Math.min(kelvinMin, kelvin);
        kelvinMax = Math.max(kelvinMax, kelvin);
      }
      for (const tracerKg of frame.tracerKg) {
        tracerMgM3Max = Math.max(
          tracerMgM3Max,
          concentrationMgM3(recording, tracerKg),
        );
      }
      for (const velocity of frame.faceVelocityMS) {
        speedAbsMax = Math.max(speedAbsMax, Math.abs(velocity));
      }
    }
  }
  return Object.freeze({
    kelvin: { min: kelvinMin, max: kelvinMax },
    tracerMgM3: { min: 0, max: tracerMgM3Max },
    faceVelocityMS: { min: -speedAbsMax, max: speedAbsMax },
  });
}

export function recordedFrameFacts(recording, frameIndex, scales) {
  const frame = recording.frames[frameIndex];
  if (!frame) throw new Error(`No recorded frame ${frameIndex}`);
  const tracer = range(frame.tracerKg);
  const heat = range(frame.heatJ);
  const velocity = range(frame.faceVelocityMS);
  return Object.freeze({
    frameIndex,
    timeSeconds: frame.timeSeconds,
    temperatureKelvin: {
      min: kelvinForHeat(recording, heat.min),
      max: kelvinForHeat(recording, heat.max),
      scale: scales.kelvin,
    },
    tracerMgM3: {
      min: concentrationMgM3(recording, tracer.min),
      max: concentrationMgM3(recording, tracer.max),
      scale: scales.tracerMgM3,
    },
    faceVelocityMS: { ...velocity, scale: scales.faceVelocityMS },
  });
}

export function recordedSlice(recording, frameIndex, z = RECORDED_SLICE_Z) {
  const frame = recording.frames[frameIndex];
  if (!frame) throw new Error(`No recorded frame ${frameIndex}`);
  const cells = recording.cellsByIndex.filter((cell) => cell.at[2] === z);
  if (cells.length !== 80)
    throw new Error(`Expected 80 cells in recorded z=${z} slice`);
  return cells.map((cell) =>
    Object.freeze({
      cell,
      solid: !cell.fluid,
      heatJ: frame.heatJ[cell.i],
      tracerKg: frame.tracerKg[cell.i],
    }),
  );
}

export function displayCell(recording, entry, scales) {
  if (entry.solid) return Object.freeze({ solid: true, cell: entry.cell });
  const kelvin = kelvinForHeat(recording, entry.heatJ);
  const tracerMgM3 = concentrationMgM3(recording, entry.tracerKg);
  return Object.freeze({
    solid: false,
    cell: entry.cell,
    kelvin,
    tracerMgM3,
    temperatureFraction: unitFraction(kelvin, scales.kelvin),
    tracerFraction: unitFraction(tracerMgM3, scales.tracerMgM3),
  });
}
