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
import { BUILDINGS, shelteredBeds } from "./construction.js";
import { commandProblem } from "./orders.ts";
import { looseWood } from "./resources.ts";
import { DAY_TICKS, hour } from "./routine.ts";
import { routeUiAction } from "./ui-actions.ts";

const ACTIVITIES = {
  idle: "Waiting for work",
  walk: "Walking",
  chop: "Chopping oak",
  pickup: "Picking up wood",
  deliver: "Delivering wood",
  build: "Building",
  sleep: "Sleeping in the bedroll",
};

const clearGesture = assign(() => ({
  tool: null,
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
export const toolMachine = createMachine({
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
    CAMERA_MOVE: { target: ".idle", actions: clearGesture },
    ESCAPE: { target: ".idle", actions: clearGesture },
    RESET: { target: ".idle", actions: clearGesture },
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

function actorFact(actor) {
  return {
    id: actor.id,
    name: actor.name,
    figure: actor.figure,
    mode: actor.mode,
    rest: actor.rest,
    routine: actor.routine,
    chopAllowed: actor.allowedWork.chop,
    haulAllowed: actor.allowedWork.haul,
    buildAllowed: actor.allowedWork.build,
    cargoAmount: actor.cargo?.amount ?? 0,
    activeJobId: actor.task?.job ?? actor.cargo?.job ?? null,
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

function displayFacts(state, notice, speed, zoom, keys, previous) {
  const nextActors = Object.fromEntries(
    Object.values(state.actors).map((actor) => [actor.id, actorFact(actor)]),
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
    target: job.target,
    reason: job.reason,
    routine: job.routine,
    actors: job.scope.actors ? [...job.scope.actors] : null,
    party: job.scope.party,
  }));
  const sitesNext = state.sites.map((site) => ({
    id: site.id,
    type: site.type,
    x: site.x,
    z: site.z,
    delivered: site.delivered,
    finished: site.finishedAt !== null,
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
    tick: state.tick,
    speed,
    zoom,
    keys: stableKeys,
    homeIds:
      previous && sameArray(homeIds, previous.homeIds)
        ? previous.homeIds
        : homeIds,
    actors,
    trees,
    jobs,
    sites,
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
  const site = display.sites.find((candidate) => candidate.id === job.target);
  const active = Object.values(display.actors).filter(
    (actor) => actor.activeJobId === job.id,
  );
  const title =
    job.kind === "chop"
      ? `Chop oak ${job.target.split("-")[1]}`
      : job.kind === "rest"
        ? job.routine
          ? "Sleep until morning"
          : "Rest in bedroll"
        : `${BUILDINGS[site.type].label} · ${site.x}, ${site.z}`;
  const detail = site
    ? ` · ${site.delivered}/${BUILDINGS[site.type].wood} wood`
    : "";
  return {
    id: job.id,
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
const selectionAtom = atom({
  selectedIds: [],
  inspectedId: null,
  treeId: null,
  context: null,
  panel: null,
  designationTargetIds: [],
});
const preferencesAtom = atom({
  cutaway: true,
  panMode: false,
  help: true,
  direction: 0,
});
const statusAtom = atom((get) => {
  const facts = get(worldFactsAtom);
  return (
    facts && {
      paused: facts.paused,
      day: facts.day,
      time: facts.time,
      speed: facts.speed,
      zoom: facts.zoom,
      keys: facts.keys,
      feed: facts.feed,
      demand: facts.demand,
      wood: facts.wood,
      notice: facts.notice,
      felled: facts.felled,
      rested: facts.rested,
      beds: facts.beds,
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
      now: active ? orderModel(facts, active).title : ACTIVITIES[actor.mode],
      next: next ? orderModel(facts, next).title : "Nothing queued",
    };
  });
  return {
    roster: facts.homeIds.map((id) => facts.actors[id]).filter(Boolean),
    selectedIds: [...selection.selectedIds],
    selected,
    work,
    focused:
      selected[0] || facts.actors[selection.inspectedId] || facts.actors.rowan,
    inspected: selection.inspectedId
      ? facts.actors[selection.inspectedId]
      : null,
    visitor:
      selection.inspectedId && !facts.homeIds.includes(selection.inspectedId)
        ? facts.actors[selection.inspectedId]
        : null,
    carry: selected.reduce((total, actor) => total + actor.cargoAmount, 0),
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
  return facts?.trees.find((tree) => tree.id === selection.treeId) || null;
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
  if (!selection.selectedIds.length && !selection.inspectedId)
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
          <li key={job.id} className={job.active ? "active-order" : ""}>
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

const WORK_TYPES = ["chop", "haul", "build"];

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
            {visitor ? "Stranded outsider" : ACTIVITIES[person.mode]}
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
          <label className="toggle">
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
      <div id="palette">
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
              {recipe.wood} wood{type === "bed" ? " · 1×2" : ""}
            </small>
          </Button>
        ))}
      </div>
      <p className="muted">
        Mark a tile or drag a row. A blueprint can wait for wood. Leave room for
        a doorway.
      </p>
      <div className="button-row">
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
  if (!m.context || !m.tree) return null;
  const targetProblem = m.tree.felled ? "That tree is already a stump." : "";
  const personalProblem = !m.selectedIds.length
    ? "Select one or more home members for a personal order."
    : targetProblem;
  return (
    <Card
      variant="outline"
      role="region"
      className="window target-window"
      aria-label="Oak actions"
      style={{
        left: Math.max(12, Math.min(innerWidth - 244, m.context.x + 12)),
        top: Math.max(80, Math.min(innerHeight - 270, m.context.y + 12)),
      }}
    >
      <div className="window-heading">
        <h2>{m.tree.felled ? "Oak stump" : "Oak tree"}</h2>
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
        {m.tree.felled
          ? "Six logs earned. The stump stays."
          : `6 wood · ${m.selectedIds.length ? `${m.selectedIds.length} selected` : "shared colony work"}`}
      </p>
      <Button
        id="mark-chop"
        variant="primary"
        disabled={!!targetProblem}
        onClick={() =>
          send({
            kind: "command",
            command: {
              kind: "chop",
              tree: m.tree.id,
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
                tree: m.tree.id,
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
                tree: m.tree.id,
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
  return (
    <Panel
      title="Goblin Bed & Breakfast"
      name="Menu"
      send={send}
      className="menu-window"
    >
      <p className="muted">Stay useful. Stay off the menu.</p>
      <div className="menu-actions">
        <Button variant="outline" onClick={() => send({ kind: "fullscreen" })}>
          Browser fullscreen
        </Button>
        <Button variant="outline" onClick={() => send({ kind: "help" })}>
          Bramble's advice
        </Button>
        <a href="/study">Character study ↗</a>
        <Button
          id="reset"
          variant="destructive"
          onClick={() => send({ kind: "reset" })}
        >
          Start a fresh clearing
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
  const status = useAtomValue(statusAtom);
  const roster = useAtomValue(rosterAtom);
  const selection = useAtomValue(selectionAtom);
  const preferences = useAtomValue(preferencesAtom);
  const orders = useAtomValue(ordersAtom);
  const target = useAtomValue(targetAtom);
  const build = useAtomValue(buildAtom);
  const tutorial = useAtomValue(tutorialAtom);
  if (!status || !roster) return null;
  const tool = machineSnapshot.context.tool;
  const phase = machineSnapshot.value;
  const m = {
    ...status,
    ...roster,
    ...build,
    orders,
    tutorial,
    tree: target,
    panel: selection.panel,
    context: selection.context,
    tool,
    phase,
    cutaway: preferences.cutaway,
    panMode: preferences.panMode,
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
              <small>{ACTIVITIES[person.mode]}</small>
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
    routeUiAction(action, runAction);
  }
  function runAction(action) {
    const current = store.get(selectionAtom);
    const facts = store.get(worldFactsAtom);
    switch (action.kind) {
      case "select": {
        machine.send({ type: "ESCAPE" });
        const selected = new Set(current.selectedIds);
        if (!facts?.homeIds.includes(action.actor)) {
          setSelection((value) => ({
            ...value,
            inspectedId: action.actor,
            panel: "character",
            selectedIds: [],
            context: null,
            treeId: null,
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
          inspectedId: null,
          panel: "character",
          context: null,
          treeId: null,
          designationTargetIds: [],
        }));
        return;
      }
      case "select-many":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          selectedIds: [...action.ids],
          inspectedId: null,
          panel: "character",
          context: null,
          treeId: null,
          designationTargetIds: [],
        }));
        return;
      case "tree":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          treeId: action.id,
          context: { ...action.point },
          panel: null,
          inspectedId: null,
          designationTargetIds: [],
        }));
        return;
      case "panel":
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          panel: value.panel === action.panel ? null : action.panel,
          treeId: null,
          context: null,
          designationTargetIds: [],
        }));
        return;
      case "close-target":
        setSelection((value) => ({ ...value, treeId: null, context: null }));
        return;
      case "close":
        const keepBuild = !!machine.getSnapshot().context.tool;
        machine.send({ type: "ESCAPE" });
        setSelection((value) => ({
          ...value,
          panel: keepBuild ? "build" : null,
          context: null,
          treeId: null,
          designationTargetIds: [],
        }));
        return;
      case "tool":
        machine.send({ type: "TOOL", tool: action.tool });
        setSelection((value) => ({
          ...value,
          panel: "build",
          treeId: null,
          context: null,
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
        effect({
          kind: "commit-designation",
          targetIds: [...current.designationTargetIds],
        });
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
          context: null,
          treeId: null,
          designationTargetIds: [],
        }));
        return;
      case "reset":
        machine.send({ type: "RESET" });
        setSelection(() => ({
          selectedIds: [],
          inspectedId: null,
          treeId: null,
          context: null,
          panel: null,
          designationTargetIds: [],
        }));
        setPreferences(() => ({
          cutaway: true,
          panMode: false,
          help: true,
          direction: 0,
        }));
        effect(action);
        return;
      case "cutaway":
        setPreferences((value) => ({ ...value, cutaway: action.value }));
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
          command.kind === "cancel" ||
          command.kind === "next" ||
          command.kind === "build"
        )
          command.actors = null;
        else if (command.actors === undefined)
          command.actors = [...current.selectedIds];
        effect({ kind: "command", command });
        return;
      }
      case "recruit":
        effect({ kind: "recruit", actor: action.actor });
        return;
      default:
        effect(action);
    }
  }
  function update(state, notice, speed, zoom, keys) {
    const facts = displayFacts(
      state,
      notice,
      speed,
      zoom,
      keys,
      store.get(worldFactsAtom),
    );
    store.set(worldFactsAtom, facts);
  }
  function view() {
    const value = store.get(selectionAtom);
    const preferences = store.get(preferencesAtom);
    const snapshot = machine.getSnapshot();
    return {
      selectedIds: [...value.selectedIds],
      inspectedId: value.inspectedId,
      tree: value.treeId,
      context: value.context && { ...value.context },
      designationTargetIds: [...value.designationTargetIds],
      cutaway: preferences.cutaway,
      panMode: preferences.panMode,
      direction: preferences.direction,
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
    view,
    machine,
    destroy() {
      machine.stop();
      root.unmount();
    },
  };
}
