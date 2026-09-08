import assert from "node:assert/strict";
import test from "node:test";
import { siteMaterialEndpoint } from "./construction.js";
import {
  brewStartAvailable,
  brewStationPresentation,
  clearSpentGrainStartAvailable,
  shouldUseBrewStationPanel,
  tapStartAvailable,
} from "./brew-station-presentation.js";

const site = {
  id: "site-brew",
  type: "brew-station",
  x: 6,
  z: 7,
  level: 0,
  direction: 0,
  work: 144,
  finishedAt: 12,
};

function state({
  process = null,
  attending = false,
  settled = false,
  exhausted = false,
  served = 0,
  tap = null,
} = {}) {
  const lots = [
    {
      id: "water",
      material: "water",
      quantity: 2,
      location: { kind: "container", container: "kettle:site-brew" },
    },
    {
      id: "malt",
      material: "malt",
      quantity: 2,
      location: { kind: "container", container: "kettle:site-brew" },
    },
    {
      id: "mugwort",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: "kettle:site-brew" },
    },
    {
      id: "fuel",
      material: "wood",
      quantity: 1,
      location: { kind: "container", container: "brew-hearth:site-brew" },
    },
    {
      id: "barm",
      material: "barm",
      quantity: 1,
      location: { kind: "container", container: "brew-barm:site-brew" },
    },
    {
      id: "keg",
      material: "keg",
      quantity: 1,
      location: { kind: "container", container: "brew-keg:site-brew" },
    },
  ];
  if (settled || exhausted) {
    lots.push({
      id: "grain",
      material: "spent-grain",
      quantity: 1,
      location: { kind: "container", container: "brew-tray:site-brew" },
    });
    if (!exhausted)
      lots.push({
        id: "ale",
        material: "ale",
        quantity: 4 - served,
        location: { kind: "container", container: "vessel:keg" },
      });
  }
  return {
    materials: {
      lots,
      transformations:
        settled || exhausted
          ? [
              {
                id: "batch-1",
                definition: "herbal-ale-v1",
                settlement: {
                  station: "kettle:site-brew",
                  retained: [],
                  outputs: [
                    {
                      role: "ale",
                      destination: "vessel:keg",
                      material: "ale",
                      quantity: 4,
                    },
                    {
                      role: "spent-grain",
                      destination: "brew-tray:site-brew",
                      material: "spent-grain",
                      quantity: 1,
                    },
                  ],
                },
              },
            ]
          : [],
      consumptions: Array.from({ length: served }, (_, index) => ({
        id: `tap-${index + 1}`,
        transformation: "batch-1",
        role: "ale",
        material: "ale",
        quantity: 1,
      })),
    },
    jobs: [
      { id: "job-brew", kind: "brew", target: site.id, reason: "Ordered" },
      ...(tap
        ? [
            {
              id: "job-tap",
              kind: "tap",
              target: site.id,
              reason: "Ready to tap herbal ale",
              progress: tap.progress,
            },
          ]
        : []),
    ],
    processes: process
      ? [
          {
            id: "brew:job-brew",
            job: "job-brew",
            station: site.id,
            phase: process,
            progress: 7,
          },
        ]
      : [],
    actors: {
      rowan: {
        task: attending
          ? { kind: "brew", job: "job-brew", target: "brew:job-brew" }
          : null,
      },
    },
  };
}

test("station projection reads exact canonical slot and vessel contents", () => {
  const fact = brewStationPresentation(
    state({ process: "prepare", attending: true }),
    site,
  );
  assert.deepEqual(fact.slots, {
    kettle: { water: 2, malt: 2, mugwort: 1 },
    hearth: { wood: 1 },
    barm: { barm: 1 },
    keg: { keg: 1, ale: 0 },
    tray: { spentGrain: 0 },
  });
  assert.equal(fact.brewJob.reason, "Ordered");
  assert.equal(fact.attending, true);
  assert.equal(fact.visualProfile, "prepare-attended");
});

test("station presentation resolves explicit slot identities, never compatible material order", () => {
  assert.equal(
    siteMaterialEndpoint(site, "kettle")?.destination.id,
    "kettle:site-brew",
  );
  assert.equal(
    siteMaterialEndpoint(site, "hearth")?.destination.id,
    "brew-hearth:site-brew",
  );
  assert.equal(
    siteMaterialEndpoint(site, "barm")?.destination.id,
    "brew-barm:site-brew",
  );
  assert.equal(
    siteMaterialEndpoint(site, "keg")?.destination.id,
    "brew-keg:site-brew",
  );
  assert.equal(
    siteMaterialEndpoint(site, "tray")?.destination.id,
    "brew-tray:site-brew",
  );
});

test("unfinished brew blueprints stay on the generic structure presentation", () => {
  assert.equal(shouldUseBrewStationPanel(site, { id: site.id }), true);
  assert.equal(
    shouldUseBrewStationPanel({ ...site, finishedAt: null }, null),
    false,
  );
});

test("fermentation is calm and settlement requires real keg and tray contents", () => {
  assert.equal(
    brewStationPresentation(state({ process: "ferment" }), site).visualProfile,
    "ferment",
  );
  const settled = brewStationPresentation(state({ settled: true }), site);
  assert.equal(settled.process, null);
  assert.equal(settled.slots.keg.ale, 4);
  assert.equal(settled.slots.tray.spentGrain, 1);
  assert.equal(settled.visualProfile, "settled");
  assert.equal(settled.tapReady, true);
});

test("an exhausted keg keeps the real spent-grain tray visible and blocks a new brew", () => {
  const exhausted = brewStationPresentation(state({ exhausted: true }), site);
  assert.equal(exhausted.slots.keg.ale, 0);
  assert.equal(exhausted.slots.tray.spentGrain, 1);
  assert.equal(exhausted.settled, true);
  assert.equal(exhausted.tapReady, false);
  assert.equal(exhausted.visualProfile, "settled");
  assert.equal(brewStartAvailable(exhausted), false);
  assert.equal(clearSpentGrainStartAvailable(exhausted), true);
});

test("Tap projects only its canonical station job and live ale without serving policy", () => {
  const active = brewStationPresentation(
    state({ settled: true, tap: { progress: 5 } }),
    site,
  );
  assert.deepEqual(active.tapJob, {
    id: "job-tap",
    reason: "Ready to tap herbal ale",
    progress: 5,
    active: false,
  });
  assert.equal(tapStartAvailable(active), false);

  const ready = brewStationPresentation(state({ settled: true }), site);
  assert.equal(ready.tapReady, true);
  assert.equal(tapStartAvailable(ready), true);

  const partlyServed = brewStationPresentation(
    state({ settled: true, served: 2 }),
    site,
  );
  assert.equal(partlyServed.served, 2);
  assert.equal(partlyServed.servingTotal, 4);

  const exhausted = brewStationPresentation(state({ exhausted: true }), site);
  assert.equal(exhausted.tapReady, false);
  assert.equal(tapStartAvailable(exhausted), false);
  assert.equal(clearSpentGrainStartAvailable(exhausted), true);
});
