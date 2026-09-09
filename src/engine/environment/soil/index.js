// Pure shared physical owner. World material IDs, initial water and excavation
// permission are consumer definitions. No clock, storage, renderer or host IO.
export { createVolume } from "./volume.mjs";
export { createVolumeGeometry, REGION_LIMITS } from "./geometry.mjs";
export { createSoil, compensatedSum } from "./soil.mjs";
export { NUMERICS, balanceTolerance, changeMass } from "./state.mjs";
