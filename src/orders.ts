import type {
  Clearing,
  Command,
  Herb,
  Job,
  Scope,
  WorkCommand,
} from "./model.ts";
import { inScope, scopeProblem } from "./actors.ts";
import { placementProblem } from "./construction.js";
import { interruptWork } from "./activity.ts";
import { refundWood } from "./resources.ts";
import { blockedCells, cellKey, inside, placementOccupant } from "./world.js";
import { route, beginWalk } from "./movement.js";

export type CommandResult =
  { status: "applied" } | { status: "rejected"; reason: string };

export function commandProblem(state: Clearing, command: Command): string {
  if (command.kind === "recruit") {
    if (!state.parties[command.party]) return "That party is not here.";
    if (!state.actors[command.actor]) return "That person is not here.";
    if (
      Object.values(state.parties).some((party) =>
        party.members.includes(command.actor),
      )
    )
      return "That person has already joined a party.";
    return "";
  }
  if (command.kind === "draft" || command.kind === "undraft") {
    const party = state.parties[command.party];
    const person = state.actors[command.actor];
    if (!party) return "That party is not here.";
    if (!person || !party.members.includes(person.id))
      return "Choose a home member.";
    if (command.kind === "draft")
      return person.drafted ? "That home member is already drafted." : "";
    return person.drafted ? "" : "That home member is not drafted.";
  }
  if (command.kind === "go") {
    const party = state.parties[command.party];
    const person = state.actors[command.actor];
    if (!party) return "That party is not here.";
    if (!person || !party.members.includes(person.id))
      return "Choose a home member.";
    if (!person.drafted) return "Only a drafted home member can Go.";
    if (!inside(command.target)) return "Choose a clear ground tile.";
    if (blockedCells(state).has(cellKey(command.target)))
      return "That ground is blocked.";
    return route(person, command.target, blockedCells(state)) === null
      ? "That ground is unreachable."
      : "";
  }
  const problem = scopeProblem(state, command);
  if (problem) return problem;
  if ("direct" in command && command.direct && command.actors === null)
    return "Select the people for a direct order.";
  if (command.kind === "sow") {
    if (!inside(command)) return "Choose clear ground inside the clearing.";
    if (placementOccupant(state, command)) return "Choose clear ground.";
  }
  if (command.kind === "harvest") {
    const herb = state.herbs.find((candidate) => candidate.id === command.herb);
    if (!herb) return "That mugwort is no longer here.";
    if (herb.stage !== "ready") return "Only ready mugwort can be harvested.";
    if (
      state.jobs.some((job) => job.kind === "harvest" && job.target === herb.id)
    )
      return "That mugwort is already marked for harvest.";
  }
  if (command.kind === "build") return placementProblem(state, command);
  if (command.kind === "deconstruct") {
    const site = state.sites.find((candidate) => candidate.id === command.site);
    if (!site) return "That structure is no longer here.";
    if (site.finishedAt === null)
      return "Only a finished structure can be deconstructed.";
    if (
      state.jobs.some(
        (job) => job.kind === "deconstruct" && job.target === site.id,
      )
    )
      return "That structure is already marked for deconstruction.";
  }
  if (command.kind === "chop") {
    const tree = state.trees.find((t) => t.id === command.tree);
    if (!tree) return "Select an oak tree first.";
    if (tree.felledAt !== null) return "That tree is already a stump.";
    if (
      !command.direct &&
      state.jobs.some((j) => j.kind === "chop" && j.target === tree.id)
    )
      return "That tree is already ordered.";
  }
  if (command.kind === "cancel" || command.kind === "next") {
    const job = state.jobs.find((j) => j.id === command.job);
    if (!job) return "That order is no longer available.";
    if (job && job.scope.party !== command.party)
      return "That order belongs to another party.";
  }
  return "";
}
function cancelJob(state: Clearing, id: string): void {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) return;
  for (const person of Object.values(state.actors)) {
    if (job.routine && person.id === job.target) person.routine = false;
    if (person.task?.job === id || person.cargo?.job === id)
      interruptWork(state, person);
  }
  switch (job.kind) {
    case "build": {
      const site = state.sites.find((s) => s.id === job.target)!;
      state.sites = state.sites.filter((s) => s.id !== site.id);
      refundWood(state, site, site.delivered);
      break;
    }
    case "chop":
    case "rest":
      break;
    case "deconstruct":
      break;
    case "sow":
      state.herbs = state.herbs.filter((herb) => herb.id !== job.target);
      break;
    case "harvest":
      break;
    default:
      assertNever(job);
  }
  state.jobs = state.jobs.filter((j) => j.id !== id);
  state.workDirty = true;
  state.notice = "Order canceled. Completed work stays completed.";
}
function assertNever(value: never): never {
  throw new Error(`Unhandled order kind: ${JSON.stringify(value)}`);
}
function prioritize(state: Clearing, job: Job): void {
  state.jobs = [job, ...state.jobs.filter((j) => j.id !== job.id)];
  state.workDirty = true;
}
function orderWork(state: Clearing, command: WorkCommand): void {
  const scope: Scope = {
    party: command.party,
    actors: command.actors && [...command.actors],
  };
  const people = Object.values(state.actors).filter((person) =>
    inScope(state, person, scope),
  );
  if (command.direct) for (const person of people) interruptWork(state, person);
  if (command.kind === "rest") {
    for (const person of people) {
      const previous = state.jobs.find(
        (j) => j.kind === "rest" && j.target === person.id,
      );
      if (previous) {
        previous.routine = false;
        if (command.direct) prioritize(state, previous);
        continue;
      }
      const job: Job = {
        id: `job-${state.nextId++}`,
        kind: "rest",
        target: person.id,
        scope: { party: scope.party, actors: [person.id] },
        reason: "Ordered",
        routine: false,
      };
      if (command.direct) state.jobs.unshift(job);
      else state.jobs.push(job);
    }
  } else if (command.kind === "chop") {
    const previous = state.jobs.find(
      (j) => j.kind === "chop" && j.target === command.tree,
    );
    if (previous) {
      for (const person of Object.values(state.actors))
        if (person.task?.job === previous.id) interruptWork(state, person);
      previous.scope = scope;
      prioritize(state, previous);
    } else {
      const job: Job = {
        id: `job-${state.nextId++}`,
        kind: "chop",
        target: command.tree,
        scope,
        reason: "Ordered",
        routine: false,
      };
      if (command.direct) state.jobs.unshift(job);
      else state.jobs.push(job);
    }
  } else if (command.kind === "sow") {
    const herb: Herb = {
      id: `herb-${state.nextId++}`,
      kind: "mugwort",
      x: command.x,
      z: command.z,
      level: command.level,
      stage: "ordered",
      work: 0,
      plantedAt: null,
    };
    state.herbs.push(herb);
    const job: Job = {
      id: `job-${state.nextId++}`,
      kind: "sow",
      target: herb.id,
      scope,
      reason: "Ordered",
      routine: false,
    };
    if (command.direct) state.jobs.unshift(job);
    else state.jobs.push(job);
  } else if (command.kind === "harvest") {
    const job: Job = {
      id: `job-${state.nextId++}`,
      kind: "harvest",
      target: command.herb,
      scope,
      reason: "Ordered",
      routine: false,
    };
    if (command.direct) state.jobs.unshift(job);
    else state.jobs.push(job);
  } else if (command.kind === "build") {
    const site = {
      id: `site-${state.nextId++}`,
      type: command.type,
      x: command.x,
      z: command.z,
      level: command.level,
      direction: command.direction === 1 ? 1 : 0,
      delivered: 0,
      work: 0,
      finishedAt: null,
    };
    state.sites.push(site);
    const job: Job = {
      id: `job-${state.nextId++}`,
      kind: "build",
      target: site.id,
      scope,
      reason: "Ordered",
      routine: false,
    };
    if (command.direct) state.jobs.unshift(job);
    else state.jobs.push(job);
  } else {
    const job: Job = {
      id: `job-${state.nextId++}`,
      kind: "deconstruct",
      target: command.site,
      scope,
      reason: "Ordered",
      routine: false,
    };
    if (command.direct) state.jobs.unshift(job);
    else state.jobs.push(job);
  }
  state.workDirty = true;
  state.notice =
    command.kind === "sow"
      ? "Mugwort ordered. A home member will plant it on clear ground."
      : command.kind === "harvest"
        ? "Mugwort harvest ordered."
        : command.kind === "build"
          ? "Blueprint placed. Wood will be brought when it is available."
          : command.kind === "deconstruct"
            ? "Deconstruction ordered. The structure will remain until the work is complete."
            : command.direct
              ? "Direct order received. Earlier unfinished orders are kept."
              : "Work added to the orders.";
}
function acceptCommand(state: Clearing, command: Command): CommandResult {
  const problem = commandProblem(state, command);
  if (problem) return { status: "rejected", reason: problem };
  switch (command.kind) {
    case "recruit":
      state.parties[command.party].members.push(command.actor);
      state.workDirty = true;
      state.notice = `${state.actors[command.actor].name} joined. Two pairs of hands, one very questionable plan.`;
      return { status: "applied" };
    case "draft": {
      const person = state.actors[command.actor];
      interruptWork(state, person);
      person.drafted = true;
      state.notice = `${person.name} is drafted and holding position.`;
      state.workDirty = true;
      return { status: "applied" };
    }
    case "undraft": {
      const person = state.actors[command.actor];
      person.drafted = false;
      if (person.mode === "walk") {
        person.mode = "idle";
        person.path = [];
        person.leg = 0;
      }
      state.notice = `${person.name} is available for ordinary work again.`;
      state.workDirty = true;
      return { status: "applied" };
    }
    case "go": {
      const person = state.actors[command.actor];
      const path = route(person, command.target, blockedCells(state));
      if (path === null)
        return { status: "rejected", reason: "That ground is unreachable." };
      if (path.length) beginWalk(person, path);
      else {
        person.mode = "idle";
        person.path = [];
        person.leg = 0;
      }
      state.notice = `${person.name} is moving to clear ground.`;
      return { status: "applied" };
    }
    case "cancel":
      cancelJob(state, command.job);
      return { status: "applied" };
    case "next": {
      const job = state.jobs.find((j) => j.id === command.job);
      if (job) prioritize(state, job);
      state.notice = "Moved to the front. Current activities finish first.";
      return { status: "applied" };
    }
    case "routine":
      for (const person of Object.values(state.actors)) {
        if (!inScope(state, person, command)) continue;
        person.routine = command.enabled;
        if (!command.enabled)
          for (const job of state.jobs.filter(
            (j) => j.routine && j.target === person.id,
          ))
            cancelJob(state, job.id);
      }
      state.workDirty = true;
      return { status: "applied" };
    case "work": {
      let changed = 0;
      for (const person of Object.values(state.actors)) {
        if (!inScope(state, person, command)) continue;
        person.allowedWork[command.work] = command.enabled;
        changed++;
      }
      state.workDirty = true;
      state.notice = `Automatic ${command.work} work ${command.enabled ? "enabled" : "disabled"} for ${changed} home member${changed === 1 ? "" : "s"}.`;
      return { status: "applied" };
    }
    case "chop":
    case "build":
    case "deconstruct":
    case "sow":
    case "harvest":
    case "rest":
      orderWork(state, command);
      return { status: "applied" };
    default:
      return assertNever(command);
  }
}

// Commands are admitted in array order at the current completed tick. Only
// applied transitions enter replay history; rejected attempts remain results
// for the caller to display.
export function admitCommands(
  state: Clearing,
  commands: Command[],
): CommandResult[] {
  return commands.map((command) => {
    const result = acceptCommand(state, command);
    if (result.status === "applied")
      state.commands.push({ ...structuredClone(command), tick: state.tick });
    return result;
  });
}
