import { siteMaterialEndpoint } from "./construction.js";
import {
  containerContents,
  containerQuantity,
  vesselContainer,
} from "./materials.ts";
import { recipeDefinition } from "./recipes.ts";
import { stationVisualProfile } from "./brew-station-profiles.js";
import { paidAtmosphereRelease } from "./world-presets/goblin-environment/paid-releases.ts";

function stationContainer(site, slot) {
  const endpoint = siteMaterialEndpoint(site, slot);
  if (!endpoint)
    throw new Error(`Brew station has no ${slot} presentation endpoint`);
  return endpoint.destination;
}

function jobFact(state, kind, station) {
  const job = state.jobs.find(
    (candidate) => candidate.kind === kind && candidate.target === station.id,
  );
  if (!job) return null;
  return Object.freeze({
    id: job.id,
    reason: job.reason,
    progress:
      job.kind === "tap" || job.kind === "clear-spent-grain"
        ? job.progress
        : null,
    active: Object.values(state.actors).some(
      (actor) => actor.task?.job === job.id,
    ),
  });
}

function settledBatchFact(state, site) {
  const station = stationContainer(site, "kettle").id;
  return [...(state.materials.transformations ?? [])]
    .reverse()
    .find((transformation) => {
      if (transformation.settlement?.station !== station) return false;
      const definition = recipeDefinition(transformation.definition);
      const output = transformation.settlement.outputs.find(
        (entry) => entry.role === definition.discard.outputRole,
      );
      const discarded = (state.materials.consumptions ?? []).reduce(
        (total, entry) =>
          total +
          (entry.transformation === transformation.id &&
          entry.role === definition.discard.outputRole
            ? entry.quantity
            : 0),
        0,
      );
      return output && discarded < output.quantity;
    });
}

function servingFact(state, batch) {
  if (!batch?.settlement) return Object.freeze({ served: 0, total: 0 });
  const definition = recipeDefinition(batch.definition);
  const output = batch.settlement.outputs.find(
    (entry) => entry.role === definition.tap.outputRole,
  );
  const served = (state.materials.consumptions ?? []).reduce(
    (total, entry) =>
      total +
      (entry.transformation === batch.id &&
      entry.role === definition.tap.outputRole
        ? entry.quantity
        : 0),
    0,
  );
  return Object.freeze({ served, total: output?.quantity ?? 0 });
}

/**
 * The one renderer/HUD projection of actual station contents and work. It
 * reads canonical containers, jobs, processes, and actor activity; it cannot
 * create recipe inputs, output, or a command.
 */
export function brewStationPresentation(state, site) {
  if (site.type !== "brew-station")
    throw new Error("Brew station presentation requires a brew station site");
  const kettle = stationContainer(site, "kettle");
  const hearth = stationContainer(site, "hearth");
  const barm = stationContainer(site, "barm");
  const keg = stationContainer(site, "keg");
  const tray = stationContainer(site, "tray");
  const kegLot = containerContents(state.materials, keg.id).find(
    (lot) => lot.material === "keg",
  );
  const process = state.processes.find(
    (candidate) => candidate.station === site.id,
  );
  const settledBatch = settledBatchFact(state, site);
  const brewJob = jobFact(state, "brew", site);
  const slots = Object.freeze({
    kettle: Object.freeze({
      water: containerQuantity(state.materials, kettle.id, "water"),
      malt: containerQuantity(state.materials, kettle.id, "malt"),
      mugwort: containerQuantity(state.materials, kettle.id, "mugwort"),
    }),
    hearth: Object.freeze({
      wood: containerQuantity(state.materials, hearth.id, "wood"),
    }),
    barm: Object.freeze({
      barm: containerQuantity(state.materials, barm.id, "barm"),
    }),
    keg: Object.freeze({
      keg: kegLot?.quantity ?? 0,
      ale: kegLot
        ? containerQuantity(state.materials, vesselContainer(kegLot.id), "ale")
        : 0,
    }),
    tray: Object.freeze({
      spentGrain: containerQuantity(state.materials, tray.id, "spent-grain"),
    }),
  });
  const processFact = process
    ? Object.freeze({
        id: process.id,
        phase: process.phase,
        progress: process.progress,
      })
    : null;
  const serving = servingFact(state, settledBatch);
  const attending = !!(
    process?.phase === "prepare" &&
    Object.values(state.actors).some(
      (actor) => actor.task?.kind === "brew" && actor.task.job === process.job,
    )
  );
  const release =
    process?.phase === "ferment"
      ? paidAtmosphereRelease(state.atmosphereReleases, process.binding)
      : null;
  const burning = !!release && release.remainingS > 0;
  const fact = {
    id: site.id,
    x: site.x,
    z: site.z,
    level: site.level,
    finished: site.finishedAt !== null,
    slots,
    water: slots.kettle.water,
    process: processFact,
    attending,
    burning,
    fillJob: jobFact(state, "fill-kettle", site),
    brewJob,
    tapJob: jobFact(state, "tap", site),
    clearJob: jobFact(state, "clear-spent-grain", site),
    // Spent grain remains an actual station occupancy after every ale portion
    // has been tapped. It is broader than a future Tap's live-ale eligibility.
    settled: !process && (slots.tray.spentGrain > 0 || slots.keg.ale > 0),
    tapReady: slots.keg.ale > 0,
    clearReady: slots.tray.spentGrain > 0 && slots.keg.ale === 0,
    served: serving.served,
    servingTotal: serving.total,
  };
  return Object.freeze({
    ...fact,
    visualProfile: stationVisualProfile(fact),
  });
}

/** Blueprints retain Target's generic construction panel until a finished fact exists. */
export function shouldUseBrewStationPanel(site, presentation) {
  return (
    site.type === "brew-station" &&
    site.finishedAt !== null &&
    presentation !== null
  );
}

/** Presentation may hide a known-occupied start, but admission stays core-owned. */
export function brewStartAvailable(station) {
  return (
    station.finished && !station.brewJob && !station.process && !station.settled
  );
}

/** Tap readiness and serving ownership remain in the core. The UI only avoids
 * a duplicate submission while canonical live ale or an existing Tap job says
 * there is nothing new to request. */
export function tapStartAvailable(station) {
  return station.tapReady && !station.tapJob;
}

export function clearSpentGrainStartAvailable(station) {
  return station.clearReady && !station.clearJob;
}
