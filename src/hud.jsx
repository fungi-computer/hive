import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { assign, createActor, createMachine } from "xstate";
import { Button } from "@fungi.computer/caps/components/button";
import { Card } from "@fungi.computer/caps/components/card";
import { Checkbox } from "@fungi.computer/caps/components/checkbox";
import "@fungi.computer/caps/styles.css";
import {
  BUILDINGS,
  constructionBuffer,
  brewKettle,
  footprint,
  shelfContainer,
  shelteredBeds,
} from "./construction.js";
import {
  carriedLot,
  containerContents,
  containerQuantity,
  transferForActor,
  vesselContainer,
} from "./materials.ts";
import {
  sourceContainerSpec,
  sourceIsOpen,
  sourcePailContainerSpec,
} from "./finite-sources.ts";
import { commandProblem } from "./orders.ts";
import { looseWood } from "./resources.ts";
import { DAY_TICKS, hour } from "./routine.ts";
import { SIZE, stairLanding } from "./world.js";
import { ClearingMinimap } from "./clearing-minimap.jsx";
import { BrewStationPanel } from "./BrewStationPanel.jsx";
import {
  brewStationPresentation,
  shouldUseBrewStationPanel,
} from "./brew-station-presentation.js";
import {
  dispatchUiAction,
  DEBUG_PICKING_CONTROL,
  LEVEL_NAVIGATION,
  cameraMoveKeepsTool,
  localGoodsAt,
  requiredToolLevel,
  singlePlacementTool,
  submitDesignation,
} from "./ui-actions.ts";

const ACTIVITIES = {
  idle: "Waiting for work",
  walk: "Walking",
  chop: "Chopping oak",
  transfer: "Moving material",
  build: "Building",
  deconstruct: "Deconstructing",
  sow: "Planting mugwort",
  harvest: "Harvesting mugwort",
  "brew-water": "Filling brew kettle",
  "water-delivery": "Delivering water",
  brew: "Brewing herbal ale",
  tap: "Tapping herbal ale",
  sleep: "Sleeping in the bedroll",
};

function actorActivity(actor) {
  if (!actor.drafted) return ACTIVITIES[actor.mode];
  return actor.mode === "walk" ? "Drafted · Going" : "Drafted · Holding";
}

function levelName(level) {
  return level === 1 ? "Upper" : "Ground";
}

const clearGesture = assign(() => ({
  tool: null,
  gesture: null,
  start: null,
  end: null,
  commitRequested: false,
}));

const clearGestureKeepTool = assign(({ context }) => ({
  tool: context.tool,
  gesture: null,
  start: null,
  end: null,
  commitRequested: false,
}));

const keepToolReady = assign(({ context, event }) => ({
  tool: context.tool,
  gesture: null,
  start: null,
  end: event.point ?? context.end,
  commitRequested: false,
}));

// This machine owns every tool/gesture phase. It has no simulation state,
// actors, clocks, or timers; those remain in main.js and the typed core.
const toolMachine = createMachine({
  id: "tool-gesture",
  initial: "idle",
  context: {
    tool: null,
    gesture: null,
    start: null,
    end: null,
    commitRequested: false,
  },
  on: {
    TOOL: [
      {
        target: ".ready",
        actions: [clearGesture, assign(({ event }) => ({ tool: event.tool }))],
        guard: ({ event }) => !!event.tool,
      },
      {
        target: ".idle",
        actions: clearGesture,
      },
    ],
    CANCEL: { target: ".idle", actions: clearGesture },
    CAMERA_MOVE: [
      {
        target: ".ready",
        guard: ({ context }) => cameraMoveKeepsTool(context.tool),
        actions: clearGestureKeepTool,
      },
      { target: ".idle", actions: clearGesture },
    ],
    ESCAPE: { target: ".idle", actions: clearGesture },
    RESET: { target: ".idle", actions: clearGesture },
    LEVEL_CHANGE: [
      {
        target: ".ready",
        guard: ({ context }) => !!context.tool,
        actions: clearGestureKeepTool,
      },
      { target: ".idle", actions: clearGesture },
    ],
    CANCEL_STROKE: [
      {
        target: ".ready",
        guard: ({ context }) => !!context.tool,
        actions: clearGestureKeepTool,
      },
      { target: ".idle", actions: clearGesture },
    ],
  },
  states: {
    idle: {
      on: {
        BEGIN: {
          target: "dragging",
          actions: assign(({ event }) => ({
            tool: null,
            gesture: "box",
            start: event.point,
            end: event.point,
            commitRequested: false,
          })),
        },
      },
    },
    ready: {
      on: {
        MOVE: { actions: assign(({ event }) => ({ end: event.point })) },
        BEGIN: {
          target: "dragging",
          actions: assign(({ context, event }) => ({
            gesture: "tool",
            start: event.point,
            end: event.point,
            tool: context.tool,
            commitRequested: false,
          })),
        },
      },
    },
    dragging: {
      on: {
        MOVE: { actions: assign(({ event }) => ({ end: event.point })) },
        END: {
          target: "fixed",
          actions: assign(({ event }) => ({ end: event.point })),
        },
      },
    },
    fixed: {
      on: {
        PLACED: { target: "ready", actions: keepToolReady },
        COMMIT: {
          actions: assign(() => ({ commitRequested: true })),
          guard: ({ context }) => !context.commitRequested,
        },
        COMMIT_RESULT: [
          {
            target: "ready",
            guard: ({ event }) => event.accepted > 0,
            actions: keepToolReady,
          },
          { target: "ready", actions: keepToolReady },
        ],
      },
    },
  },
});

function actorFact(actor, materials) {
  const transfer = transferForActor(materials, actor.id);
  const hand = carriedLot(materials, actor.id);
  return {
    id: actor.id,
    name: actor.name,
    figure: actor.figure,
    mode: actor.mode,
    drafted: actor.drafted,
    rest: actor.rest,
    routine: actor.routine,
    chopAllowed: actor.allowedWork.chop,
    haulAllowed: actor.allowedWork.haul,
    buildAllowed: actor.allowedWork.build,
    gardenAllowed: actor.allowedWork.garden,
    carriedAmount: hand?.quantity ?? 0,
    cargoMaterial: hand?.material ?? null,
    activeJobId: actor.task?.job ?? transfer?.owner.job ?? null,
    x: actor.x,
    z: actor.z,
    level: actor.level,
  };
}

// This is a small display projection, not a whole-world clone. React receives
// only immutable facts it renders and never observes mutable simulation actors.
function sameArray(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameObject(a, b) {
  if (!a || !b) return a === b;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  );
}

function sameBundle(a, b) {
  if (
    !a ||
    !b ||
    a.id !== b.id ||
    a.kind !== b.kind ||
    a.amount !== b.amount ||
    a.vesselWater !== b.vesselWater
  )
    return false;
  const left = a.location;
  const right = b.location;
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "ground")
    return (
      left.x === right.x && left.z === right.z && left.level === right.level
    );
  if (left.kind === "carried") return left.actor === right.actor;
  return left.site === right.site;
}

function sameKeys(a, b) {
  const names = Object.keys(a);
  return (
    names.length === Object.keys(b).length &&
    names.every(
      (name) =>
        a[name]?.key === b[name]?.key && a[name]?.title === b[name]?.title,
    )
  );
}

function displayFacts(state, notice, speed, zoom, keys, save, previous) {
  const nextActors = Object.fromEntries(
    Object.values(state.actors).map((actor) => [
      actor.id,
      actorFact(actor, state.materials),
    ]),
  );
  const actors =
    previous &&
    Object.keys(nextActors).every((id) =>
      sameObject(nextActors[id], previous.actors[id]),
    )
      ? previous.actors
      : Object.fromEntries(
          Object.entries(nextActors).map(([id, fact]) => [
            id,
            previous?.actors[id] && sameObject(fact, previous.actors[id])
              ? previous.actors[id]
              : fact,
          ]),
        );
  const beds = shelteredBeds(state).length;
  const time = hour(state);
  const nextRestProblems = Object.fromEntries(
    state.parties.home.members.map((id) => {
      const problem = commandProblem(state, {
        party: "home",
        actors: [id],
        kind: "rest",
      });
      return [id, problem];
    }),
  );
  const restProblems =
    previous && sameObject(nextRestProblems, previous.restProblems)
      ? previous.restProblems
      : nextRestProblems;
  const homeIds = [...state.parties.home.members];
  const treesNext = state.trees.map((tree) => ({
    id: tree.id,
    x: tree.x,
    z: tree.z,
    level: tree.level,
    felled: tree.felledAt !== null,
    work: tree.work,
  }));
  const jobsNext = state.jobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    target: "target" in job ? job.target : null,
    lot: job.kind === "store" ? job.source : null,
    shelf: job.kind === "store" ? job.destination.replace("shelf:", "") : null,
    reason: job.reason,
    routine: job.routine,
    actors: job.scope.actors ? [...job.scope.actors] : null,
    party: job.scope.party,
  }));
  const sitesNext = state.sites.map((site) => {
    const shelf = shelfContainer(site.id);
    return {
      id: site.id,
      type: site.type,
      x: site.x,
      z: site.z,
      level: site.level,
      direction: site.direction,
      materialsInBuffer: containerQuantity(
        state.materials,
        constructionBuffer(site).id,
        "wood",
      ),
      work: site.work,
      finished: site.finishedAt !== null,
      shelfCapacity: shelf.capacity,
      shelfWoodBulk: shelf.bulk.wood,
      shelfMugwortBulk: shelf.bulk.mugwort,
      contents: containerContents(state.materials, shelf.id).map((lot) => ({
        id: lot.id,
        material: lot.material,
        quantity: lot.quantity,
      })),
      incomingBulk: state.materials.transfers
        .filter(
          (transfer) =>
            transfer.intent.kind === "deliver" &&
            transfer.intent.destination === shelf.id,
        )
        .reduce((total, transfer) => {
          const lot = state.materials.lots.find(
            (candidate) =>
              candidate.id ===
              (transfer.phase.kind === "reserved"
                ? transfer.phase.sourceLot
                : transfer.phase.lot),
          );
          const bulk = lot && shelf.bulk[lot.material];
          return bulk ? total + transfer.request.quantity * bulk : total;
        }, 0),
      kettleWater:
        site.type === "brew-station"
          ? containerQuantity(state.materials, brewKettle(site).id, "water")
          : 0,
      brewStation:
        site.type === "brew-station" && site.finishedAt !== null
          ? brewStationPresentation(state, site)
          : null,
    };
  });
  const sourcesNext = state.sources.map((source) => {
    const provider = sourceContainerSpec(source);
    const pailProvider = sourcePailContainerSpec(source);
    return {
      id: source.id,
      kind: source.kind,
      x: source.x,
      z: source.z,
      level: source.level,
      material: provider.accepts[0],
      quantity: containerQuantity(
        state.materials,
        provider.id,
        provider.accepts[0],
      ),
      capacity: provider.capacity,
      pailQuantity: pailProvider
        ? containerQuantity(state.materials, pailProvider.id, "pail")
        : 0,
      open: sourceIsOpen(source),
    };
  });
  const structures = state.sites.map((site) => ({
    id: site.id,
    type: site.type,
    finished: site.finishedAt !== null,
    cells: [
      ...footprint(site),
      ...(site.type === "stair" && site.finishedAt !== null
        ? [stairLanding(site)]
        : []),
    ],
  }));
  const herbsNext = state.herbs.map((herb) => ({
    id: herb.id,
    x: herb.x,
    z: herb.z,
    level: herb.level,
    stage: herb.stage,
    work: herb.work,
    plantedAt: herb.plantedAt,
    establishment: herb.establishment?.kind ?? null,
    establishedAt: herb.establishment?.at ?? null,
  }));
  const waterDeliveriesNext = state.operations.map((operation) => ({
    id: operation.id,
    job: operation.job,
    targetKind: operation.target.kind,
    targetId:
      operation.target.kind === "kettle"
        ? operation.target.station
        : operation.target.herb,
    phase: operation.phase,
    quantity: operation.quantity,
  }));
  const lotsNext = state.materials.lots.map((lot) => ({
    id: lot.id,
    material: lot.material,
    amount: lot.quantity,
    vesselWater:
      lot.material === "pail"
        ? containerQuantity(state.materials, vesselContainer(lot.id), "water")
        : 0,
    location:
      lot.location.kind === "container"
        ? { kind: "stored", site: lot.location.container.replace("shelf:", "") }
        : lot.location.kind === "hand"
          ? { kind: "carried", actor: lot.location.actor }
          : { ...lot.location },
  }));
  const trees =
    previous &&
    treesNext.length === previous.trees.length &&
    treesNext.every((tree, index) => sameObject(tree, previous.trees[index]))
      ? previous.trees
      : treesNext;
  const jobs =
    previous &&
    jobsNext.length === previous.jobs.length &&
    jobsNext.every((job, index) => sameObject(job, previous.jobs[index]))
      ? previous.jobs
      : jobsNext;
  const sites =
    previous &&
    sitesNext.length === previous.sites.length &&
    sitesNext.every((site, index) => sameObject(site, previous.sites[index]))
      ? previous.sites
      : sitesNext;
  const herbs =
    previous &&
    herbsNext.length === previous.herbs.length &&
    herbsNext.every((herb, index) => sameObject(herb, previous.herbs[index]))
      ? previous.herbs
      : herbsNext;
  const lots =
    previous &&
    lotsNext.length === previous.lots.length &&
    lotsNext.every((bundle, index) => sameBundle(bundle, previous.lots[index]))
      ? previous.lots
      : lotsNext;
  const sources =
    previous &&
    sourcesNext.length === previous.sources.length &&
    sourcesNext.every((source, index) =>
      sameObject(source, previous.sources[index]),
    )
      ? previous.sources
      : sourcesNext;
  const waterDeliveries =
    previous &&
    waterDeliveriesNext.length === previous.waterDeliveries.length &&
    waterDeliveriesNext.every((operation, index) =>
      sameObject(operation, previous.waterDeliveries[index]),
    )
      ? previous.waterDeliveries
      : waterDeliveriesNext;
  const demand =
    state.demand &&
    previous?.demand &&
    sameObject(state.demand, previous.demand)
      ? previous.demand
      : state.demand && { ...state.demand };
  const feed = `FAKE SHIITAKE · ${state.paused ? "paused" : state.demand ? `event ${state.feed.sequence} · simulated` : "seeded event pending"}`;
  const stableKeys =
    previous && sameKeys(keys, previous.keys) ? previous.keys : keys;
  return {
    paused: state.paused,
    size: SIZE,
    tick: state.tick,
    speed,
    zoom,
    keys: stableKeys,
    save: previous?.save === save ? previous.save : save,
    homeIds:
      previous && sameArray(homeIds, previous.homeIds)
        ? previous.homeIds
        : homeIds,
    actors,
    trees,
    jobs,
    sites,
    structures,
    herbs,
    waterDeliveries,
    lots,
    sources,
    day: 1 + Math.floor((state.tick + DAY_TICKS / 3) / DAY_TICKS),
    time: `${String(Math.floor(time)).padStart(2, "0")}:${String(Math.floor((time % 1) * 60)).padStart(2, "0")}`,
    feed,
    demand,
    wood: looseWood(state),
    felled: state.felled,
    rested: state.rested,
    beds,
    restProblems,
    notice,
  };
}

function orderModel(display, job) {
  const site = display.sites.find(
    (candidate) =>
      candidate.id === (job.kind === "store" ? job.shelf : job.target),
  );
  const active = Object.values(display.actors).filter(
    (actor) => actor.activeJobId === job.id,
  );
  const title =
    job.kind === "chop"
      ? `Chop oak ${job.target.split("-")[1]}`
      : job.kind === "sow"
        ? "Plant mugwort"
        : job.kind === "harvest"
          ? "Harvest mugwort"
          : job.kind === "water-mugwort"
            ? "Water mugwort"
            : job.kind === "rest"
              ? job.routine
                ? "Sleep until morning"
                : "Rest in bedroll"
              : job.kind === "store"
                ? "Store material"
                : job.kind === "repair-cache"
                  ? "Repair reclaimed cache"
                  : job.kind === "fill-kettle"
                    ? "Fill brew-station kettle"
                    : job.kind === "brew"
                      ? "Brew herbal ale"
                      : job.kind === "tap"
                        ? "Tap herbal ale"
                        : site
                          ? `${BUILDINGS[site.type].label} · ${site.x}, ${site.z} · ${site.level ? "Upper" : "Ground"}`
                          : "Work order";
  const detail =
    job.kind === "store"
      ? site
        ? ` · Shelf ${site.x}, ${site.z} · ${site.level ? "Upper" : "Ground"}`
        : ""
      : site
        ? ` · ${site.materialsInBuffer}/${BUILDINGS[site.type].wood} wood · ${site.level ? "Upper" : "Ground"}`
        : "";
  return {
    id: job.id,
    kind: job.kind,
    target: job.target,
    lot: job.lot,
    shelf: job.shelf,
    reason: job.reason,
    title,
    active: active.length > 0,
    detail:
      `${job.actors ? `Personal (${job.actors.map((id) => display.actors[id]?.name || id).join(" + ")})` : "Shared (home)"} · ` +
      (active.length
        ? `${active.map((actor) => actor.name).join(" + ")} · ${ACTIVITIES[active[0].mode]}`
        : job.reason || "Ordered") +
      detail,
  };
}

const worldFactsAtom = atom(null);
const cameraFactsAtom = atom(null);
const selectionAtom = atom({
  selectedIds: [],
  inspectedTarget: null,
  panel: null,
  designationTargetIds: [],
});
const preferencesAtom = atom({
  cutaway: true,
  debugPicking: false,
  panMode: false,
  help: true,
  direction: 0,
  level: 0,
});
const statusAtom = atom((get) => {
  const facts = get(worldFactsAtom);
  const camera = get(cameraFactsAtom);
  return (
    facts && {
      paused: facts.paused,
      day: facts.day,
      time: facts.time,
      speed: facts.speed,
      zoom: camera?.zoom ?? facts.zoom,
      keys: facts.keys,
      feed: facts.feed,
      demand: facts.demand,
      wood: facts.wood,
      notice: facts.notice,
      felled: facts.felled,
      rested: facts.rested,
      beds: facts.beds,
      save: facts.save,
    }
  );
});
const rosterAtom = atom((get) => {
  const facts = get(worldFactsAtom);
  const selection = get(selectionAtom);
  if (!facts) return null;
  const selected = selection.selectedIds
    .map((id) => facts.actors[id])
    .filter(Boolean);
  const work = selected.map((actor) => {
    const active = facts.jobs.find((job) => job.id === actor.activeJobId);
    const next = facts.jobs.find(
      (job) => job.id !== actor.activeJobId && job.actors?.includes(actor.id),
    );
    return {
      id: actor.id,
      name: actor.name,
      now: active ? orderModel(facts, active).title : actorActivity(actor),
      next: next ? orderModel(facts, next).title : "Nothing queued",
    };
  });
  return {
    roster: facts.homeIds.map((id) => facts.actors[id]).filter(Boolean),
    selectedIds: [...selection.selectedIds],
    selected,
    work,
    focused:
      selected[0] ||
      (selection.inspectedTarget?.kind === "actor"
        ? facts.actors[selection.inspectedTarget.id]
        : null) ||
      facts.actors.rowan,
    inspected:
      selection.inspectedTarget?.kind === "actor"
        ? facts.actors[selection.inspectedTarget.id]
        : null,
    visitor:
      selection.inspectedTarget?.kind === "actor" &&
      !facts.homeIds.includes(selection.inspectedTarget.id)
        ? facts.actors[selection.inspectedTarget.id]
        : null,
    carry: selected.reduce((total, actor) => total + actor.carriedAmount, 0),
    routine: selected.length
      ? selected.every((actor) => actor.routine)
      : !!facts.actors.rowan?.routine,
    routineMixed:
      selected.length > 1 &&
      selected.some((actor) => actor.routine !== selected[0].routine),
    restProblem: selected.length
      ? selected.map((actor) => facts.restProblems[actor.id]).find(Boolean) ||
        ""
      : "Select a home member for a personal order.",
  };
});
const ordersAtom = atom((get) => {
  const facts = get(worldFactsAtom);
  return facts ? facts.jobs.map((job) => orderModel(facts, job)) : [];
});
const targetAtom = atom((get) => {
  const facts = get(worldFactsAtom);
  const selection = get(selectionAtom);
  const target = selection.inspectedTarget;
  if (!facts || !target) return null;
  if (target.kind === "actor") {
    const actor = facts.actors[target.id];
    return actor ? { kind: "actor", ...actor } : null;
  }
  if (target.kind === "tree") {
    const tree = facts.trees.find((candidate) => candidate.id === target.id);
    return tree
      ? {
          kind: "tree",
          ...tree,
          localGoods: localGoodsAt(facts.lots, tree),
        }
      : null;
  }
  if (target.kind === "herb") {
    const herb = facts.herbs.find((candidate) => candidate.id === target.id);
    if (!herb) return null;
    const waterJob = facts.jobs.find(
      (job) => job.kind === "water-mugwort" && job.target === herb.id,
    );
    return {
      kind: "herb",
      ...herb,
      waterDelivery: waterJob
        ? facts.waterDeliveries.find(
            (operation) => operation.job === waterJob.id,
          ) || null
        : null,
    };
  }
  if (target.kind === "lot") {
    const lot = facts.lots.find((candidate) => candidate.id === target.id);
    if (!lot) return null;
    return {
      ...lot,
      kind: "lot",
      shelves: facts.sites
        .filter((site) => site.type === "shelf" && site.finished)
        .map((site) => ({
          id: site.id,
          x: site.x,
          z: site.z,
          contents: site.contents,
          incomingBulk: site.incomingBulk,
          shelfCapacity: site.shelfCapacity,
          shelfWoodBulk: site.shelfWoodBulk,
          shelfMugwortBulk: site.shelfMugwortBulk,
        })),
    };
  }
  if (target.kind === "source") {
    const source = facts.sources.find(
      (candidate) => candidate.id === target.id,
    );
    if (!source) return null;
    const { kind: sourceKind, ...details } = source;
    return { kind: "source", sourceKind, ...details };
  }
  const site = facts.sites.find((candidate) => candidate.id === target.id);
  return site ? { kind: "site", ...site } : null;
});
const buildAtom = atom((get) => {
  const facts = get(worldFactsAtom);
  const selection = get(selectionAtom);
  const preferences = get(preferencesAtom);
  return {
    designationTargets: [...selection.designationTargetIds],
    direction: preferences.direction,
    homeStatus: facts?.felled
      ? "Oaks marked. Wood will arrive through hauling."
      : "Designate oaks before building.",
  };
});
const tutorialAtom = atom((get) => {
  const facts = get(worldFactsAtom);
  const roster = get(rosterAtom);
  const selection = get(selectionAtom);
  if (!facts || !roster) return "";
  if (!selection.selectedIds.length && !selection.inspectedTarget)
    return "Click a home member, shift-click to add one, or drag a box around both.";
  if (roster.visitor)
    return "Sedge is a visitor. Inspect her, then recruit her into the home.";
  if (!facts.felled)
    return facts.jobs.some((job) => job.kind === "build")
      ? "That blueprint needs wood. Designate oaks or give the selected people a chopping order."
      : "Click an oak for personal orders, or choose Chop designation for shared work.";
  if (!facts.sites.some((site) => site.finished))
    return "Lovely wood. Open Build and place a wall. He will carry the logs over.";
  if (!facts.beds)
    return "A room needs walls and a doorway. Put a bedroll inside and roof both its tiles.";
  if (!facts.rested)
    return "A roof, a bed. Click Rowan and order a rest. You have earned it.";
  return "There. A home. I suppose we can stay a little longer.";
});

function Key({ model, name }) {
  const hint = model.keys[name];
  return hint?.key ? <kbd aria-hidden="true">{hint.key}</kbd> : null;
}

function Panel({ title, name, send, children, className = "" }) {
  return (
    <Card
      variant="outline"
      role="region"
      className={`window ${className}`}
      aria-label={name || title}
    >
      <div className="window-heading">
        <h2>{title}</h2>
        <Button
          className="close"
          variant="ghost"
          size="icon"
          aria-label={`Close ${name || title}`}
          onClick={() => send({ kind: "close" })}
        >
          ×
        </Button>
      </div>
      {children}
    </Card>
  );
}

function Orders({ model: m, send }) {
  return (
    <ol id="orders">
      {m.orders.length ? (
        m.orders.map((job) => (
          <li
            key={job.id}
            className={job.active ? "active-order" : ""}
            data-job-kind={job.kind}
            data-job={job.id}
          >
            <span>
              <strong>{job.title}</strong>
              <small>{job.detail}</small>
            </span>
            <Button
              data-action="next"
              data-job={job.id}
              variant="ghost"
              size="icon"
              aria-label={`Move ${job.title} next`}
              onClick={() =>
                send({
                  kind: "command",
                  command: { kind: "next", job: job.id },
                })
              }
            >
              ↑
            </Button>
            <Button
              data-action="cancel"
              data-job={job.id}
              variant="ghost"
              size="icon"
              aria-label={`Cancel ${job.title}`}
              onClick={() =>
                send({
                  kind: "command",
                  command: { kind: "cancel", job: job.id },
                })
              }
            >
              ×
            </Button>
          </li>
        ))
      ) : (
        <li className="empty-orders">
          No orders. Choose a tree or mark a blueprint.
        </li>
      )}
    </ol>
  );
}

const WORK_TYPES = ["chop", "haul", "build", "garden"];

function Work({ model: m, send }) {
  return (
    <Panel
      title="Work priorities"
      name="Work"
      send={send}
      className="work-window"
    >
      <p className="muted">
        Choose the colony work each person may take automatically. A direct
        Prioritize or Queue order can still override these preferences.
      </p>
      <table className="work-grid">
        <caption className="sr-only">Automatic work by home member</caption>
        <thead>
          <tr>
            <th scope="col">Person</th>
            {WORK_TYPES.map((work) => (
              <th key={work} scope="col">
                {work[0].toUpperCase() + work.slice(1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.roster.map((person) => (
            <tr key={person.id}>
              <th scope="row">{person.name}</th>
              {WORK_TYPES.map((work) => (
                <td key={work}>
                  <Checkbox
                    id={`work-${person.id}-${work}`}
                    type="checkbox"
                    checked={person[`${work}Allowed`]}
                    aria-label={`${person.name} may ${work}`}
                    onChange={(event) =>
                      send({
                        kind: "command",
                        command: {
                          kind: "work",
                          work,
                          enabled: event.target.checked,
                          actors: [person.id],
                        },
                      })
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Haul covers pickup and delivery. Build covers work at a supplied site. A
        carried log is always delivered safely.
      </p>
    </Panel>
  );
}

function Character({ model: m, send, portraits }) {
  const person = m.visitor || m.focused;
  if (!person) return null;
  const visitor = !!m.visitor;
  const individuallySelected =
    !visitor && m.selectedIds.length === 1 && m.selectedIds[0] === person.id;
  return (
    <Panel
      title={person.name}
      name="Character"
      send={send}
      className="character-window"
    >
      <div className="character-summary">
        <img src={portraits[person.id]} alt={person.name} />
        <div>
          <p className="eyebrow">{visitor ? "VISITOR" : "HOME MEMBER"}</p>
          <strong>
            {visitor ? "Stranded outsider" : actorActivity(person)}
          </strong>
          <small>
            {visitor
              ? "She has found the clearing but not a bed."
              : m.carry
                ? `${m.carry} wood in hand`
                : "A borrowed axe. A chance to stay alive."}
          </small>
        </div>
      </div>
      {visitor ? (
        <div className="button-row">
          <Button
            id="recruit"
            variant="primary"
            onClick={() => send({ kind: "recruit", actor: person.id })}
          >
            Recruit Sedge
          </Button>
          <Button variant="secondary" onClick={() => send({ kind: "focus" })}>
            Find Sedge
          </Button>
        </div>
      ) : (
        <>
          <div className="work-status" aria-label="Current and queued work">
            {m.work.map((work) => (
              <p key={work.id}>
                <strong>{work.name}</strong>
                <span>Now · {work.now}</span>
                <span>Next · {work.next}</span>
              </p>
            ))}
          </div>
          <div className="rest-meter">
            <label htmlFor="rest-meter">
              Rest <b>{Math.round(person.rest)}%</b>
            </label>
            <meter id="rest-meter" min="0" max="100" value={person.rest} />
          </div>
          <div className="button-row">
            <Button
              id="rest"
              variant="primary"
              disabled={!!m.restProblem}
              onClick={() =>
                send({ kind: "command", command: { kind: "rest" } })
              }
            >
              Rest in bedroll
            </Button>
            <Button variant="secondary" onClick={() => send({ kind: "focus" })}>
              Center selection
            </Button>
          </div>
          <div className="button-row">
            <Button
              id="draft"
              variant={person.drafted ? "secondary" : "outline"}
              disabled={!individuallySelected}
              onClick={() =>
                send({
                  kind: "command",
                  command: {
                    kind: person.drafted ? "undraft" : "draft",
                    actor: person.id,
                  },
                })
              }
            >
              {person.drafted ? "Undraft" : "Draft"}
            </Button>
          </div>
          {person.drafted && individuallySelected && (
            <p className="muted">
              Right-click clear ground to Go. Arrival keeps the draft and
              position.
            </p>
          )}
          <label className="routine-toggle">
            <Checkbox
              id="routine"
              type="checkbox"
              checked={m.routine}
              onChange={(e) =>
                send({
                  kind: "command",
                  command: { kind: "routine", enabled: e.target.checked },
                })
              }
            />{" "}
            {m.routineMixed
              ? "Mixed routine · Space applies to selected"
              : "Work by day, sleep by night"}
          </label>
          <Button
            className="text-button"
            variant="ghost"
            size="sm"
            onClick={() => send({ kind: "panel", panel: "orders" })}
          >
            Work orders <span>{m.orders.length} →</span>
          </Button>
        </>
      )}
    </Panel>
  );
}

function Build({ model: m, send }) {
  return (
    <Panel
      title="Make a home"
      name="Build"
      send={send}
      className="build-window"
    >
      <div className="designation-tools">
        <Button
          id="chop-tool"
          variant="secondary"
          size="sm"
          aria-pressed={m.tool === "chop"}
          onClick={() =>
            send({ kind: "tool", tool: m.tool === "chop" ? null : "chop" })
          }
        >
          Chop designation
        </Button>
        {m.tool === "chop" && (
          <>
            <small>{m.designationTargets.length} oak target(s) previewed</small>
            <Button
              id="cancel-chop"
              variant="ghost"
              size="sm"
              onClick={() => send({ kind: "close" })}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
      <div className="level-readout" aria-live="polite">
        Working level: <strong>{levelName(m.level)}</strong>
      </div>
      <div id="palette">
        <Button
          id="herb-tool"
          data-tool="herb"
          variant={m.tool === "herb" ? "secondary" : "outline"}
          aria-pressed={m.tool === "herb"}
          onClick={() =>
            send({ kind: "tool", tool: m.tool === "herb" ? null : "herb" })
          }
        >
          <span>Plant mugwort</span>
          <small>single cell · shared Garden work</small>
        </Button>
        {Object.entries(BUILDINGS).map(([type, recipe]) => (
          <Button
            key={type}
            data-build={type}
            variant={m.tool === type ? "secondary" : "outline"}
            aria-pressed={m.tool === type}
            onClick={() => send({ kind: "tool", tool: type })}
          >
            <span>{recipe.label}</span>
            <small>
              {recipe.wood} wood
              {type === "floor"
                ? " · 1×1 upper"
                : type === "stair"
                  ? " · 3-cell ramp"
                  : type === "bed"
                    ? " · 1×2"
                    : type === "brew-station"
                      ? " · 2×2 ground · single anchor"
                      : ""}
            </small>
          </Button>
        ))}
      </div>
      <p className="muted">
        {m.tool === "herb"
          ? "Hover a clear tile and release to sow. Escape, right-click, or camera movement cancels."
          : m.tool && singlePlacementTool(m.tool)
            ? "Hover the anchor tile and release once to order this footprint. Escape, right-click, or camera movement cancels."
            : "Mark a tile or drag a row. A blueprint can wait for wood. Leave room for a doorway."}
      </p>
      <div className="button-row">
        {m.tool !== "herb" ? (
          <>
            <Button
              id="rotate"
              variant="outline"
              size="sm"
              disabled={!m.tool}
              onClick={() => send({ kind: "rotate" })}
            >
              Rotate footprint ↻ <Key model={m} name="build.rotate" />
            </Button>
            <Button
              id="task"
              variant="primary"
              size="sm"
              disabled={!m.tool}
              onClick={() => send({ kind: "finish-placement" })}
            >
              Done placing
            </Button>
          </>
        ) : (
          <Button
            id="cancel-herb"
            variant="ghost"
            size="sm"
            onClick={() => send({ kind: "close" })}
          >
            Cancel planting
          </Button>
        )}
      </div>
      <p id="home-status" className="home-status">
        {m.felled
          ? "Oaks marked. Wood will arrive through hauling."
          : "Designate oaks before building."}
      </p>
    </Panel>
  );
}

function Target({ model: m, send }) {
  if (!m.context || !m.target) return null;
  if (m.target.kind === "lot") {
    if (m.target.material === "pail")
      return (
        <Card
          variant="outline"
          role="region"
          className="window target-window"
          aria-label="Pail details"
          style={targetPosition(m.context)}
        >
          <div className="window-heading">
            <h2>Pail</h2>
            <Button
              className="close"
              variant="ghost"
              size="icon"
              aria-label="Close pail details"
              onClick={() => send({ kind: "close-target" })}
            >
              ×
            </Button>
          </div>
          <p className="muted">
            {m.target.location.kind === "ground"
              ? `Loose on ground · ${m.target.location.x}, ${m.target.location.z} · ${levelName(m.target.location.level)}`
              : "Held for its current operation"}
          </p>
          <small className="action-reason">
            Water {m.target.vesselWater}/2 · This vessel is used by shared brew
            work.
          </small>
        </Card>
      );
    const storeJob = m.orders.find(
      (job) => job.kind === "store" && job.lot === m.target.id,
    );
    const locationText =
      m.target.location.kind === "ground"
        ? `Loose on ground · ${m.target.location.x}, ${m.target.location.z} · ${levelName(m.target.location.level)}`
        : m.target.location.kind === "carried"
          ? `Held by ${m.target.location.actor}`
          : `Stored on shelf ${m.target.location.site}`;
    return (
      <Card
        variant="outline"
        role="region"
        className="window target-window"
        aria-label="Material lot actions"
        style={targetPosition(m.context)}
      >
        <div className="window-heading">
          <h2>{m.target.material === "wood" ? "Wood" : "Mugwort"}</h2>
          <Button
            className="close"
            variant="ghost"
            size="icon"
            aria-label="Close material actions"
            onClick={() => send({ kind: "close-target" })}
          >
            ×
          </Button>
        </div>
        <p className="muted">
          {locationText} · {m.target.amount}
        </p>
        {storeJob ? (
          <small className="action-reason" data-status="store">
            {storeJob.active
              ? "A home member is storing this material."
              : storeJob.reason || "Waiting for storage availability."}
          </small>
        ) : m.target.location.kind !== "ground" ? (
          <small className="action-reason">
            {m.target.location.kind === "carried"
              ? "This lot is held for its active transfer."
              : "This lot is already stored on its shelf."}
          </small>
        ) : m.target.shelves.length ? (
          <div className="button-column">
            {m.target.shelves.map((shelf) =>
              (() => {
                const occupied =
                  shelf.contents.reduce(
                    (sum, lot) =>
                      sum +
                      lot.quantity *
                        (lot.material === "wood"
                          ? shelf.shelfWoodBulk
                          : shelf.shelfMugwortBulk),
                    0,
                  ) + shelf.incomingBulk;
                const bulk =
                  m.target.material === "wood"
                    ? shelf.shelfWoodBulk
                    : shelf.shelfMugwortBulk;
                return (
                  <Button
                    key={shelf.id}
                    data-action="store"
                    data-lot={m.target.id}
                    data-site={shelf.id}
                    variant="primary"
                    disabled={occupied + bulk > shelf.shelfCapacity}
                    onClick={() =>
                      send({
                        kind: "command",
                        command: {
                          kind: "store",
                          lot: m.target.id,
                          shelf: shelf.id,
                        },
                      })
                    }
                  >
                    Store on shelf · {shelf.x}, {shelf.z} · {occupied}/
                    {shelf.shelfCapacity} bulk
                  </Button>
                );
              })(),
            )}
          </div>
        ) : (
          <small className="action-reason">Build a shelf first.</small>
        )}
      </Card>
    );
  }
  if (m.target.kind === "source") {
    const cache = m.target.sourceKind === "reclaimed-timber-cache";
    const repairJob = m.orders.find(
      (job) => job.kind === "repair-cache" && job.target === m.target.id,
    );
    const actionLabel = repairJob
      ? repairJob.active
        ? "Repair in progress"
        : "Repair queued"
      : "Repair cache";
    return (
      <Card
        variant="outline"
        role="region"
        className="window target-window"
        aria-label="Finite source details"
        style={targetPosition(m.context)}
      >
        <div className="window-heading">
          <h2>{cache ? "Reclaimed timber cache" : "Spring"}</h2>
          <Button
            className="close"
            variant="ghost"
            size="icon"
            aria-label="Close source details"
            onClick={() => send({ kind: "close-target" })}
          >
            ×
          </Button>
        </div>
        <p className="muted">
          {m.target.material === "wood" ? "Wood" : "Water"} {m.target.quantity}/
          {m.target.capacity} · {m.target.x}, {m.target.z} ·{" "}
          {levelName(m.target.level)}
        </p>
        <small className="action-reason">
          {m.target.open ? "Open access." : "Sealed; repair opens access."}
          {cache && ` Pail ${m.target.pailQuantity}/1.`}
        </small>
        {cache && !m.target.open && (
          <Button
            id="repair-cache"
            data-action="repair-cache"
            data-source={m.target.id}
            variant="primary"
            disabled={!!repairJob}
            aria-label={actionLabel}
            onClick={() =>
              send({ kind: "command", command: { kind: "repair-cache" } })
            }
          >
            {actionLabel}
          </Button>
        )}
      </Card>
    );
  }
  if (m.target.kind === "site") {
    if (shouldUseBrewStationPanel(m.target, m.target.brewStation)) {
      const deconstructJob = m.orders.find(
        (job) => job.kind === "deconstruct" && job.target === m.target.id,
      );
      return (
        <BrewStationPanel
          station={m.target.brewStation}
          context={targetPosition(m.context)}
          deconstructJob={deconstructJob}
          send={send}
        />
      );
    }
    const label = BUILDINGS[m.target.type].label;
    const deconstructJob = m.orders.find(
      (job) => job.kind === "deconstruct" && job.target === m.target.id,
    );
    const actionLabel = deconstructJob
      ? deconstructJob.active
        ? "Deconstruction in progress"
        : "Deconstruction queued"
      : "Deconstruct";
    const fillJob = m.orders.find(
      (job) => job.kind === "fill-kettle" && job.target === m.target.id,
    );
    const fillLabel = fillJob
      ? fillJob.active
        ? "Filling kettle"
        : "Fill queued"
      : "Fill kettle";
    return (
      <Card
        variant="outline"
        role="region"
        className="window target-window"
        aria-label="Structure actions"
        style={targetPosition(m.context)}
      >
        <div className="window-heading">
          <h2>
            {label} · {levelName(m.target.level)}
          </h2>
          <Button
            className="close"
            variant="ghost"
            size="icon"
            aria-label="Close structure actions"
            onClick={() => send({ kind: "close-target" })}
          >
            ×
          </Button>
        </div>
        <p className="muted">
          {m.target.type === "shelf"
            ? (() => {
                const wood = m.target.contents
                  .filter((lot) => lot.material === "wood")
                  .reduce((sum, lot) => sum + lot.quantity, 0);
                const mugwort = m.target.contents
                  .filter((lot) => lot.material === "mugwort")
                  .reduce((sum, lot) => sum + lot.quantity, 0);
                const occupied =
                  wood * m.target.shelfWoodBulk +
                  mugwort * m.target.shelfMugwortBulk;
                return `Wood ${wood} · Mugwort ${mugwort} · ${occupied}/${m.target.shelfCapacity} bulk${m.target.incomingBulk ? ` · ${m.target.incomingBulk} incoming` : ""}`;
              })()
            : `Finished structure · ${m.target.x}, ${m.target.z} · ${levelName(m.target.level)}`}
        </p>
        {m.target.type === "shelf" && (
          <small className="action-reason">
            {m.target.contents.length
              ? `Contents: ${m.target.contents.map((lot) => `${lot.material === "wood" ? "Wood" : "Mugwort"} ×${lot.quantity}`).join(", ")}. Shelf art shows up to three representatives.`
              : "Contents: empty."}
          </small>
        )}
        {m.target.type === "brew-station" && m.target.finished && (
          <>
            <small className="action-reason">
              Kettle water {m.target.kettleWater}/2.
            </small>
            <Button
              id="fill-kettle"
              data-action="fill-kettle"
              data-site={m.target.id}
              variant="primary"
              disabled={!!fillJob || m.target.kettleWater >= 2}
              aria-label={fillLabel}
              onClick={() =>
                send({
                  kind: "command",
                  command: { kind: "fill-kettle", station: m.target.id },
                })
              }
            >
              {fillLabel}
            </Button>
          </>
        )}
        <Button
          id="deconstruct"
          data-action="deconstruct"
          data-site={m.target.id}
          variant="primary"
          disabled={!!deconstructJob}
          aria-label={`${actionLabel} ${label}`}
          onClick={() =>
            send({
              kind: "command",
              command: { kind: "deconstruct", site: m.target.id },
            })
          }
        >
          {actionLabel}
        </Button>
        {deconstructJob && (
          <small className="action-reason" data-status="deconstruct">
            {deconstructJob.active
              ? "A home member is working on this structure."
              : "This structure is already in the work queue."}
          </small>
        )}
      </Card>
    );
  }
  if (m.target.kind === "herb") {
    const harvestJob = m.orders.find(
      (job) => job.kind === "harvest" && job.target === m.target.id,
    );
    const actionLabel = harvestJob
      ? harvestJob.active
        ? "Harvest in progress"
        : "Harvest queued"
      : "Harvest mugwort";
    const waterJob = m.orders.find(
      (job) => job.kind === "water-mugwort" && job.target === m.target.id,
    );
    const needsWater =
      m.target.stage === "planted" && m.target.establishment === null;
    const waterLabel = waterJob
      ? waterJob.active
        ? "Watering in progress"
        : "Water queued"
      : "Water mugwort";
    const waterStatus = waterJob
      ? waterJob.active
        ? m.target.waterDelivery?.phase === "acquire"
          ? "A home member is recovering the shared pail."
          : m.target.waterDelivery?.phase === "draw"
            ? "A home member is drawing water."
            : "A home member is carrying water to this mugwort."
        : waterJob.reason || "Waiting for shared water delivery."
      : needsWater
        ? "Needs water · Deliver 2 water once to begin growth."
        : m.target.establishment
          ? "Established · Growing normally."
          : null;
    return (
      <Card
        variant="outline"
        role="region"
        className="window target-window"
        aria-label="Mugwort actions"
        style={targetPosition(m.context)}
      >
        <div className="window-heading">
          <h2>Mugwort</h2>
          <Button
            className="close"
            variant="ghost"
            size="icon"
            aria-label="Close mugwort actions"
            onClick={() => send({ kind: "close-target" })}
          >
            ×
          </Button>
        </div>
        <p className="muted">
          {needsWater
            ? "Needs water"
            : m.target.stage[0].toUpperCase() + m.target.stage.slice(1)}{" "}
          · {m.target.x}, {m.target.z} · {levelName(m.target.level)}
        </p>
        {waterStatus && (
          <small className="action-reason" data-status="water-mugwort">
            {waterStatus}
          </small>
        )}
        {(needsWater || waterJob) && (
          <Button
            id="water-mugwort"
            data-action="water-mugwort"
            data-herb={m.target.id}
            variant="primary"
            disabled={!!waterJob}
            aria-label={waterLabel}
            onClick={() =>
              send({
                kind: "command",
                command: { kind: "water-mugwort", herb: m.target.id },
              })
            }
          >
            {waterLabel}
          </Button>
        )}
        {m.target.stage === "ready" && (
          <Button
            id="harvest-herb"
            data-action="harvest"
            data-herb={m.target.id}
            variant="primary"
            disabled={!!harvestJob}
            aria-label={actionLabel}
            onClick={() =>
              send({
                kind: "command",
                command: { kind: "harvest", herb: m.target.id },
              })
            }
          >
            {actionLabel}
          </Button>
        )}
        {harvestJob && (
          <small className="action-reason" data-status="harvest">
            {harvestJob.active
              ? "A home member is harvesting this mugwort."
              : "This mugwort is already in the shared work queue."}
          </small>
        )}
      </Card>
    );
  }
  if (m.target.kind !== "tree") return null;
  const tree = m.target;
  const targetProblem = tree.felled ? "That tree is already a stump." : "";
  const personalProblem = !m.selectedIds.length
    ? "Select one or more home members for a personal order."
    : targetProblem;
  return (
    <Card
      variant="outline"
      role="region"
      className="window target-window"
      aria-label="Oak actions"
      style={targetPosition(m.context)}
    >
      <div className="window-heading">
        <h2>{tree.felled ? "Oak stump" : "Oak tree"}</h2>
        <Button
          className="close"
          variant="ghost"
          size="icon"
          aria-label="Close oak actions"
          onClick={() => send({ kind: "close-target" })}
        >
          ×
        </Button>
      </div>
      <p className="muted">
        {tree.felled
          ? "Six logs earned. The stump stays."
          : `6 wood · ${m.selectedIds.length ? `${m.selectedIds.length} selected` : "shared colony work"}`}
      </p>
      {tree.localGoods.length > 0 && (
        <div className="button-column" aria-label="Loose goods here">
          <small className="action-reason">Loose goods on this cell</small>
          {tree.localGoods.map((lot) => (
            <Button
              key={lot.id}
              data-action="inspect-lot"
              data-lot={lot.id}
              variant="outline"
              onClick={() =>
                send({ kind: "inspect-lot", id: lot.id, point: m.context })
              }
            >
              {lot.material === "wood" ? "Wood" : "Mugwort"} ×{lot.amount}
            </Button>
          ))}
        </div>
      )}
      <Button
        id="mark-chop"
        variant="primary"
        disabled={!!targetProblem}
        onClick={() =>
          send({
            kind: "command",
            command: {
              kind: "chop",
              tree: tree.id,
              direct: false,
              actors: null,
            },
          })
        }
      >
        Mark for chopping <Key model={m} name="tree.chop" />
      </Button>
      <div className="button-row">
        <Button
          id="chop-now"
          variant="primary"
          disabled={!!personalProblem}
          onClick={() =>
            send({
              kind: "command",
              command: {
                kind: "chop",
                tree: tree.id,
                direct: true,
                actors: [...m.selectedIds],
              },
            })
          }
        >
          Prioritize selected
        </Button>
        <Button
          id="chop-queued"
          variant="outline"
          disabled={!!personalProblem}
          onClick={() =>
            send({
              kind: "command",
              command: {
                kind: "chop",
                tree: tree.id,
                direct: false,
                actors: [...m.selectedIds],
              },
            })
          }
        >
          Queue for selected
        </Button>
      </div>
      {personalProblem && (
        <small className="action-reason">{personalProblem}</small>
      )}
    </Card>
  );
}

function Menu({ model: m, send }) {
  const save = m.save;
  const canContinue = save?.startup || m.paused;
  const continueLabel =
    save?.slot === "valid"
      ? "Continue saved clearing"
      : save?.slot === "missing"
        ? "Continue clearing"
        : "Resume fallback clearing";
  return (
    <Panel
      title="Goblin Bed & Breakfast"
      name="Menu"
      send={send}
      className="menu-window minimap-window"
    >
      <p className="muted">Stay useful. Stay off the menu.</p>
      <ClearingMinimap
        facts={m.minimap.facts}
        level={m.level}
        viewport={m.minimap.viewport}
        onRequestCenter={(cell) => send({ kind: "recenter", cell })}
      />
      {save && (
        <p id="save-status" role="status" className="muted">
          {save.message}
        </p>
      )}
      <div className="menu-actions">
        {canContinue && (
          <Button
            id="continue"
            variant="primary"
            onClick={() => send({ kind: "continue" })}
          >
            {continueLabel}
          </Button>
        )}
        {save?.rawAvailable && (
          <Button
            variant="outline"
            onClick={() => send({ kind: "download-raw-save" })}
          >
            Download raw local save
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => send({ kind: "download-backup" })}
        >
          Download backup
        </Button>
        <Button variant="outline" onClick={() => send({ kind: "fullscreen" })}>
          Browser fullscreen
        </Button>
        <Button variant="outline" onClick={() => send({ kind: "help" })}>
          Bramble's advice
        </Button>
        <label>
          <Checkbox
            id="debug-picking"
            type="checkbox"
            checked={m.debugPicking}
            onChange={() => send(DEBUG_PICKING_CONTROL.action)}
          />{" "}
          {DEBUG_PICKING_CONTROL.label}{" "}
          <Key model={m} name={DEBUG_PICKING_CONTROL.name} />
        </label>
        <a href="/study">Studies ↗</a>
        <Button
          id="reset"
          variant="destructive"
          onClick={() => send({ kind: "reset" })}
        >
          New clearing
        </Button>
      </div>
      <p className="muted">
        Drag with the middle mouse button to pan. Mouse wheel zooms. On touch,
        turn on Pan view.
      </p>
      <dl className="shortcut-list">
        {Object.entries(m.keys)
          .filter(([, hint]) => hint.key)
          .map(([name, hint]) => (
            <div key={name}>
              <dt>{hint.title}</dt>
              <dd>
                <kbd>{hint.key}</kbd>
              </dd>
            </div>
          ))}
      </dl>
    </Panel>
  );
}

function Hud({ machineSnapshot, send, portraits }) {
  const facts = useAtomValue(worldFactsAtom);
  const camera = useAtomValue(cameraFactsAtom);
  const status = useAtomValue(statusAtom);
  const roster = useAtomValue(rosterAtom);
  const selection = useAtomValue(selectionAtom);
  const preferences = useAtomValue(preferencesAtom);
  const orders = useAtomValue(ordersAtom);
  const target = useAtomValue(targetAtom);
  const build = useAtomValue(buildAtom);
  const tutorial = useAtomValue(tutorialAtom);
  if (!facts || !camera || !status || !roster) return null;
  const tool = machineSnapshot.context.tool;
  const phase = machineSnapshot.value;
  const m = {
    ...status,
    ...roster,
    ...build,
    orders,
    tutorial,
    target,
    tree: target?.kind === "tree" ? target : null,
    panel: selection.panel,
    context: selection.inspectedTarget?.point || null,
    tool,
    phase,
    cutaway: preferences.cutaway,
    debugPicking: preferences.debugPicking,
    panMode: preferences.panMode,
    level: preferences.level,
    minimap: {
      facts: {
        size: facts.size,
        actors: Object.values(facts.actors),
        trees: facts.trees,
        structures: facts.structures,
        selectedActorIds: selection.selectedIds,
      },
      viewport: camera.visibleAreas[preferences.level],
    },
    help: preferences.help,
    notice: status.paused
      ? `Paused · ${status.notice || "time is frozen; orders remain available."}`
      : tool === "chop"
        ? phase === "fixed"
          ? "Submitting the shared Chop designation at the fixed step."
          : phase === "dragging"
            ? "Drag across standing oaks; release once to submit."
            : "Chop designation active · drag across one or more standing oaks."
        : status.notice,
  };
  return (
    <>
      <div className="world-heading">
        <span className="place-name">Bramble clearing</span>
        <span id="day">
          Day {m.day} <b>{m.time}</b>
        </span>
      </div>
      <div className="time-controls">
        <Button
          id="pause"
          variant="ghost"
          size="icon"
          aria-label={m.paused ? "Resume" : "Pause"}
          onClick={() => send({ kind: "pause" })}
        >
          {m.paused ? "▶" : "Ⅱ"}
        </Button>
        <Button
          id="speed"
          variant="ghost"
          size="sm"
          aria-label="Change simulation speed"
          onClick={() => send({ kind: "speed" })}
        >
          {m.speed}×
        </Button>
      </div>
      <nav className="roster" aria-label="Your people">
        {m.roster.map((person) => (
          <Button
            key={person.id}
            id={`select-${person.id}`}
            variant="ghost"
            size="sm"
            aria-label={`Select ${person.name}`}
            aria-pressed={m.selectedIds.includes(person.id)}
            onClick={(event) =>
              send({
                kind: "select",
                actor: person.id,
                toggle: event.shiftKey || event.ctrlKey || event.metaKey,
              })
            }
          >
            <img src={portraits[person.id]} alt="" />
            <span>
              {person.name}
              <small>{actorActivity(person)}</small>
            </span>
          </Button>
        ))}
      </nav>
      <aside className="story">
        <span id="feed">{m.feed}</span>
        {m.demand && (
          <p id="demand">
            <b>{m.demand.name}</b> “{m.demand.text}”
          </p>
        )}
      </aside>
      <div className="view-controls">
        <Button
          aria-label="Zoom out"
          variant="ghost"
          size="icon"
          disabled={m.zoom === 1}
          onClick={() => send({ kind: "zoom", delta: -1 })}
        >
          −
        </Button>
        <span>{m.zoom}×</span>
        <Button
          aria-label="Zoom in"
          variant="ghost"
          size="icon"
          disabled={m.zoom === 4}
          onClick={() => send({ kind: "zoom", delta: 1 })}
        >
          +
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={m.panMode}
          onClick={() => send({ kind: "pan-mode" })}
        >
          Pan view
        </Button>
      </div>
      {m.panel === "character" && (
        <Character model={m} send={send} portraits={portraits} />
      )}
      {m.panel === "build" && <Build model={m} send={send} />}
      {m.panel === "work" && <Work model={m} send={send} />}
      {m.panel === "orders" && (
        <Panel
          title="Work orders"
          name="Orders"
          send={send}
          className="orders-window"
        >
          <p className="muted">
            First ready order runs. Move next keeps the current activity intact.
          </p>
          <Orders model={m} send={send} />
        </Panel>
      )}
      {m.panel === "menu" && <Menu model={m} send={send} />}
      <Target model={m} send={send} />
      {m.help && (
        <Card
          role="complementary"
          variant="outline"
          className={`bramble-advice ${m.panel ? "with-panel" : ""}`}
          aria-label="Bramble's advice"
        >
          <img src={portraits.cat} alt="Bramble the cat" />
          <div>
            <strong>Bramble</strong>
            <p>{m.tutorial}</p>
          </div>
          <Button
            className="close"
            variant="ghost"
            size="icon"
            aria-label="Dismiss Bramble's advice"
            onClick={() => send({ kind: "help" })}
          >
            ×
          </Button>
        </Card>
      )}
      <div className="status-line">
        <span id="notice" role="status">
          {m.notice}
        </span>
        <span id="score">
          {m.wood} wood · {m.carry} carried
        </span>
      </div>
      <Card
        role="navigation"
        variant="outline"
        className="command-bar"
        aria-label="Colony controls"
      >
        <Button
          variant={m.panel === "build" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={m.panel === "build"}
          onClick={() => send({ kind: "panel", panel: "build" })}
        >
          Build <Key model={m} name="panel.build" />
        </Button>
        <Button
          variant={m.panel === "work" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={m.panel === "work"}
          onClick={() => send({ kind: "panel", panel: "work" })}
        >
          Work
        </Button>
        <Button
          variant={m.panel === "orders" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={m.panel === "orders"}
          onClick={() => send({ kind: "panel", panel: "orders" })}
        >
          Orders <span>{m.orders.length}</span>{" "}
          <Key model={m} name="panel.orders" />
        </Button>
        <div className="level-controls" role="group" aria-label="Logical level">
          {LEVEL_NAVIGATION.map((control) => (
            <Button
              key={control.name}
              data-level={control.level}
              variant={m.level === control.level ? "secondary" : "ghost"}
              size="sm"
              aria-label={control.title}
              aria-pressed={m.level === control.level}
              disabled={!control.enabled(m.level)}
              onClick={() => send(control.action)}
            >
              {control.label} <Key model={m} name={control.name} />
            </Button>
          ))}
        </div>
        <label className="cutaway-control">
          <Checkbox
            id="cutaway"
            type="checkbox"
            checked={m.cutaway}
            onChange={(e) => send({ kind: "cutaway", value: e.target.checked })}
          />{" "}
          Cutaway
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Center on selection"
          onClick={() => send({ kind: "focus" })}
        >
          Center <Key model={m} name="camera.focus" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={m.help}
          onClick={() => send({ kind: "help" })}
        >
          Bramble
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open game menu"
          aria-pressed={m.panel === "menu"}
          onClick={() => send({ kind: "panel", panel: "menu" })}
        >
          ☰
        </Button>
      </Card>
    </>
  );
}

function targetPosition(point) {
  return {
    "--target-left": `${Math.max(12, Math.min(innerWidth - 244, point.x + 12))}px`,
    "--target-top": `${Math.max(12, point.y + 12)}px`,
  };
}

function portrait(texture, crop) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 56;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(texture.source.resource, ...crop, 0, 0, 48, 56);
  return canvas.toDataURL();
}

function equalIds(a, b) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function HudHost({ machine, send, portraits }) {
  const lastFocused = useRef(null);
  const snapshot = useSyncExternalStore(
    (listener) => {
      const subscription = machine.subscribe(listener);
      return () => subscription.unsubscribe();
    },
    () => machine.getSnapshot(),
    () => machine.getSnapshot(),
  );
  useEffect(() => {
    const remember = (event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.matches(
          "button, a, input, textarea, select, [contenteditable]",
        )
      )
        lastFocused.current = event.target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  useLayoutEffect(() => {
    const lost = lastFocused.current;
    if (!lost || lost.isConnected || document.activeElement !== document.body)
      return;
    const fallback =
      document.querySelector(".orders-window .window-heading button") ||
      document.querySelector(".orders-window h2") ||
      document.querySelector("#game");
    if (!fallback) return;
    if (fallback instanceof HTMLElement && fallback.tagName === "H2")
      fallback.tabIndex = -1;
    fallback.focus({ preventScroll: true });
  });
  useLayoutEffect(() => {
    const hud = document.querySelector("#hud");
    const rail = hud?.querySelector(".command-bar");
    if (!hud || !rail) return;
    const updateReservedLayout = () => {
      hud.style.setProperty(
        "--hud-rail-bottom",
        `${Math.ceil(rail.getBoundingClientRect().height) + 12}px`,
      );
    };
    updateReservedLayout();
    const observer = new ResizeObserver(updateReservedLayout);
    observer.observe(rail);
    window.addEventListener("resize", updateReservedLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateReservedLayout);
    };
  }, []);
  return <Hud machineSnapshot={snapshot} send={send} portraits={portraits} />;
}

export function createHud(host, art, effect) {
  const store = createStore();
  const machine = createActor(toolMachine).start();
  const root = createRoot(host);
  const portraits = {
    rowan: portrait(art.figures.rowan.idle[0][0], [28, 16, 24, 28]),
    sedge: portrait(art.figures["witch-runner"].idle[0][0], [28, 16, 24, 28]),
    cat: portrait(art.figures.cat.idle[0][0], [24, 34, 30, 35]),
  };
  function setSelection(update) {
    store.set(selectionAtom, update);
  }
  function setPreferences(update) {
    store.set(preferencesAtom, update);
  }
  function dispatch(action) {
    dispatchUiAction(action, {
      run: runAction,
      level: {
        currentLevel: () => store.get(preferencesAtom).level,
        armedTool: () => machine.getSnapshot().context.tool,
        resetGesture: () => machine.send({ type: "LEVEL_CHANGE" }),
        disarmTool: () => machine.send({ type: "TOOL", tool: null }),
        setLevel: (level) => setPreferences((value) => ({ ...value, level })),
        clearInspection: () =>
          setSelection((value) => ({
            ...value,
            inspectedTarget: null,
            designationTargetIds: [],
          })),
        notice: (text) => effect({ kind: "notice", text }),
      },
    });
  }
  function runAction(action) {
    const current = store.get(selectionAtom);
    const preferences = store.get(preferencesAtom);
    const facts = store.get(worldFactsAtom);
    switch (action.kind) {
      case "select": {
        machine.send({ type: "ESCAPE" });
        const selected = new Set(current.selectedIds);
        if (!facts?.homeIds.includes(action.actor)) {
          setSelection((value) => ({
            ...value,
            inspectedTarget: { kind: "actor", id: action.actor },
            panel: "character",
            selectedIds: [],
            designationTargetIds: [],
          }));
          effect({
            kind: "notice",
            text: "Sedge is stranded here. Inspect her, then invite her home.",
          });
          return;
        }
        if (action.toggle)
          selected.has(action.actor)
            ? selected.delete(action.actor)
            : selected.add(action.actor);
        else {
          selected.clear();
          selected.add(action.actor);
        }
        setSelection((value) => ({
          ...value,
          selectedIds: [...selected],
          inspectedTarget: { kind: "actor", id: action.actor },
          panel: "character",
          designationTargetIds: [],
        }));
        return;
      }
      case "select-many":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          selectedIds: [...action.ids],
          inspectedTarget: null,
          panel: "character",
          designationTargetIds: [],
        }));
        return;
      case "tree":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          inspectedTarget: {
            kind: "tree",
            id: action.id,
            point: { x: action.point.x, y: action.point.y },
          },
          panel: null,
          designationTargetIds: [],
        }));
        return;
      case "inspect-herb":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          inspectedTarget: {
            kind: "herb",
            id: action.id,
            point: { x: action.point.x, y: action.point.y },
          },
          panel: null,
          designationTargetIds: [],
        }));
        return;
      case "inspect-lot":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          inspectedTarget: {
            kind: "lot",
            id: action.id,
            point: { x: action.point.x, y: action.point.y },
          },
          panel: null,
          designationTargetIds: [],
        }));
        return;
      case "inspect-source":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          inspectedTarget: {
            kind: "source",
            id: action.id,
            point: { x: action.point.x, y: action.point.y },
          },
          panel: null,
          designationTargetIds: [],
        }));
        return;
      case "inspect-site":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          inspectedTarget: {
            kind: "site",
            id: action.id,
            point: { x: action.point.x, y: action.point.y },
          },
          panel: null,
          designationTargetIds: [],
        }));
        return;
      case "panel":
        machine.send({
          type:
            action.panel === "menu" &&
            cameraMoveKeepsTool(machine.getSnapshot().context.tool)
              ? "CAMERA_MOVE"
              : "ESCAPE",
        });
        setSelection((value) => ({
          ...value,
          panel: value.panel === action.panel ? null : action.panel,
          inspectedTarget: null,
          designationTargetIds: [],
        }));
        return;
      case "close-target":
        setSelection((value) => ({
          ...value,
          inspectedTarget: null,
        }));
        return;
      case "close":
        const keepBuild = !!machine.getSnapshot().context.tool;
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          panel: keepBuild ? "build" : null,
          inspectedTarget: null,
          designationTargetIds: [],
        }));
        return;
      case "tool":
        machine.send({ type: "TOOL", tool: action.tool });
        if (action.tool) {
          const level = requiredToolLevel(action.tool);
          if (level !== null) setPreferences((value) => ({ ...value, level }));
        }
        setSelection((value) => ({
          ...value,
          panel: "build",
          inspectedTarget: null,
          designationTargetIds: [],
        }));
        return;
      case "cancel-stroke":
        machine.send({ type: "CANCEL_STROKE" });
        setSelection((value) => ({
          ...value,
          designationTargetIds: [],
        }));
        return;
      case "finish-placement":
        machine.send({ type: "CANCEL" });
        setSelection((value) => ({ ...value, designationTargetIds: [] }));
        return;
      case "begin":
        machine.send({ type: "BEGIN", point: action.point });
        return;
      case "move":
        machine.send({ type: "MOVE", point: action.point });
        return;
      case "end":
        machine.send({ type: "END", point: action.point });
        return;
      case "placement-result":
        machine.send({ type: "PLACED", point: action.point });
        return;
      case "set-designation":
        setSelection((value) =>
          equalIds(value.designationTargetIds, action.ids)
            ? value
            : { ...value, designationTargetIds: [...action.ids] },
        );
        return;
      case "commit-designation": {
        const snapshot = machine.getSnapshot();
        if (
          snapshot.value !== "fixed" ||
          snapshot.context.commitRequested ||
          !current.designationTargetIds.length
        )
          return;
        machine.send({ type: "COMMIT" });
        effect(submitDesignation(current.designationTargetIds));
        return;
      }
      case "commit-result":
        machine.send({ type: "COMMIT_RESULT", accepted: action.accepted });
        if (action.accepted > 0)
          setSelection((value) => ({ ...value, designationTargetIds: [] }));
        return;
      case "camera-move":
      case "escape":
        machine.send({
          type: action.kind === "camera-move" ? "CAMERA_MOVE" : "ESCAPE",
        });
        setSelection((value) => ({
          ...value,
          inspectedTarget: null,
          designationTargetIds: [],
        }));
        return;
      case "recenter":
        effect(action);
        return;
      case "reset":
        machine.send({ type: "RESET" });
        setSelection(() => ({
          selectedIds: [],
          inspectedTarget: null,
          panel: null,
          designationTargetIds: [],
        }));
        setPreferences(() => ({
          cutaway: true,
          debugPicking: false,
          panMode: false,
          help: true,
          direction: 0,
          level: 0,
        }));
        effect(action);
        return;
      case "continue":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({ ...value, panel: null }));
        effect(action);
        return;
      case "download-backup":
        effect(action);
        return;
      case "download-raw-save":
        effect(action);
        return;
      case "cutaway":
        setPreferences((value) => ({ ...value, cutaway: action.value }));
        return;
      case "debug-picking":
        setPreferences((value) => ({
          ...value,
          debugPicking: !value.debugPicking,
        }));
        return;
      case "pan-mode":
        machine.send({ type: "CAMERA_MOVE" });
        setPreferences((value) => ({ ...value, panMode: !value.panMode }));
        setSelection((value) => ({ ...value, designationTargetIds: [] }));
        return;
      case "help":
        setPreferences((value) => ({ ...value, help: !value.help }));
        return;
      case "rotate":
        setPreferences((value) => ({
          ...value,
          direction: value.direction === 0 ? 1 : 0,
        }));
        return;
      case "command": {
        const command = { ...action.command };
        if (command.kind === "recruit") delete command.actors;
        else if (
          command.kind === "draft" ||
          command.kind === "undraft" ||
          command.kind === "go"
        )
          delete command.actors;
        else if (
          command.kind === "cancel" ||
          command.kind === "next" ||
          command.kind === "build" ||
          command.kind === "deconstruct" ||
          command.kind === "sow" ||
          command.kind === "harvest" ||
          command.kind === "store" ||
          command.kind === "repair-cache" ||
          command.kind === "fill-kettle" ||
          command.kind === "water-mugwort" ||
          command.kind === "tap"
        )
          command.actors = null;
        else if (command.actors === undefined)
          command.actors = [...current.selectedIds];
        effect({ kind: "command", command });
        return;
      }
      case "go": {
        if (current.selectedIds.length !== 1) {
          effect({
            kind: "notice",
            text: "Select exactly one drafted home member before Go.",
          });
          return;
        }
        const actor = facts?.actors[current.selectedIds[0]];
        if (!actor?.drafted) {
          effect({
            kind: "notice",
            text: "Only a drafted home member can Go.",
          });
          return;
        }
        effect({
          kind: "command",
          command: {
            kind: "go",
            actor: actor.id,
            target: { ...action.point.cell },
          },
        });
        return;
      }
      case "recruit":
        effect({ kind: "recruit", actor: action.actor });
        return;
      default:
        effect(action);
    }
  }
  function update(state, notice, speed, zoom, keys, save) {
    const facts = displayFacts(
      state,
      notice,
      speed,
      zoom,
      keys,
      save,
      store.get(worldFactsAtom),
    );
    store.set(worldFactsAtom, facts);
  }
  function updateCamera(camera) {
    store.set(cameraFactsAtom, camera);
  }
  function view() {
    const value = store.get(selectionAtom);
    const preferences = store.get(preferencesAtom);
    const snapshot = machine.getSnapshot();
    return {
      selectedIds: [...value.selectedIds],
      inspectedTarget: value.inspectedTarget
        ? {
            ...value.inspectedTarget,
            point: value.inspectedTarget.point
              ? { ...value.inspectedTarget.point }
              : undefined,
          }
        : null,
      tree:
        value.inspectedTarget?.kind === "tree"
          ? value.inspectedTarget.id
          : null,
      herb:
        value.inspectedTarget?.kind === "herb"
          ? value.inspectedTarget.id
          : null,
      lot:
        value.inspectedTarget?.kind === "lot" ? value.inspectedTarget.id : null,
      source:
        value.inspectedTarget?.kind === "source"
          ? value.inspectedTarget.id
          : null,
      site:
        value.inspectedTarget?.kind === "site"
          ? value.inspectedTarget.id
          : null,
      context: value.inspectedTarget?.point
        ? { ...value.inspectedTarget.point }
        : null,
      designationTargetIds: [...value.designationTargetIds],
      cutaway: preferences.cutaway,
      debugPicking: preferences.debugPicking,
      panMode: preferences.panMode,
      direction: preferences.direction,
      level: preferences.level,
      tool: snapshot.context.tool,
      phase: snapshot.value,
      gesture: snapshot.context.gesture,
      hoverCell: snapshot.context.end?.cell
        ? { ...snapshot.context.end.cell }
        : null,
      machine: snapshot,
    };
  }
  // React mounts once. Subsequent display/selection updates are Jotai writes;
  // tool/gesture updates are delivered by the one XState subscription.
  root.render(
    <Provider store={store}>
      <HudHost machine={machine} send={dispatch} portraits={portraits} />
    </Provider>,
  );
  return {
    dispatch,
    update,
    updateCamera,
    view,
    machine,
    destroy() {
      machine.stop();
      root.unmount();
    },
  };
}
