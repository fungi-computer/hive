import { commandProblem, blockedCells } from "./clearing.js";
import { placementProblem, BUILD_TICKS } from "./construction.js";
const $ = (selector) => document.querySelector(selector);
function taskCopy(state, selection) {
  if (selection.placing)
    return [
      "Timber shelter · 2 × 2",
      placementProblem(state, selection.at, blockedCells(state)) ||
        "Click the footprint to spend 6 wood and start building.",
      "Cancel placement",
    ];
  if (selection.pending)
    return [
      "Order received",
      "Rowan will begin when time moves again.",
      "Ordered",
    ];
  if (state.pawn.mode === "walk")
    return [
      state.pawn.task.kind === "build"
        ? "Walking to the shelter site"
        : "Walking to the marked tree",
      "Rowan finds a route and carries out your order.",
      "On the way…",
    ];
  if (state.pawn.mode === "chop")
    return [
      "Chopping oak…",
      "Each swing gets you closer to a roof.",
      "Chopping…",
    ];
  if (state.pawn.mode === "build")
    return [
      `Building shelter · ${Math.floor((state.pawn.work / BUILD_TICKS) * 100)}%`,
      "Six wood committed. Posts, braces, then a roof.",
      "Building…",
    ];
  const tree = state.trees.find((t) => t.id === selection.tree);
  if (tree?.felledAt !== null && tree)
    return [
      "A stump, and a little hope",
      "Choose Build shelter, or select another oak to gather more.",
      "Tree felled",
    ];
  if (tree)
    return [
      "Oak tree · yields 6 wood",
      "Give Rowan the order when you're ready.",
      "Chop tree · +6 wood",
    ];
  if (state.completed)
    return [
      "A foothold in goblin country",
      "Chop another oak and build again. Stay off the menu.",
      "Choose a tree",
    ];
  return [
    "Rowan · stranded outsider",
    "Select Rowan, then click an oak tree.",
    "Choose a tree",
  ];
}
function renderActions(state, selection, action) {
  $("#select").classList.toggle("selected", selection.pawn);
  $("#task").textContent = action;
  $("#task").disabled =
    !selection.placing &&
    (!selection.pawn ||
      selection.pending ||
      !!commandProblem(state, { kind: "chop", tree: selection.tree }));
  $("#build").hidden = selection.placing;
  $("#build").disabled =
    !selection.pawn ||
    selection.pending ||
    state.paused ||
    state.pawn.mode !== "idle";
  $("#build").textContent = "Build shelter · 6 wood";
  $("#pause").textContent = state.paused ? "▶" : "Ⅱ";
  $("#pause").setAttribute("aria-label", state.paused ? "Resume" : "Pause");
}
function renderStory(state) {
  let status = `first event in ${Math.ceil((state.feed.nextAt - state.tick) / 20)}s`;
  if (state.demand)
    status = `#${state.feed.sequence} · ${state.demand.kind === "approval" ? "roof approved" : "roof demand"}`;
  if (state.paused) status = "paused";
  $("#feed").textContent = `FAKE SHIITAKE · ${status}`;
  $("#demand").hidden = !state.demand;
  $("#demand").textContent = state.demand
    ? `${state.demand.name.toUpperCase()}: “${state.demand.text}”`
    : "";
}
export function renderHud(state, selection, notice) {
  const [activity, hint, action] = taskCopy(state, selection);
  $("#activity").textContent = activity;
  $("#hint").textContent = selection.pawn
    ? hint
    : "Select Rowan to give work. Movement is automatic.";
  $("#notice").textContent = state.paused
    ? "Paused · even the goblins can wait."
    : selection.placing
      ? placementProblem(state, selection.at, blockedCells(state)) ||
        "Shelter site clear · Click to spend six wood and build."
      : notice || state.notice;
  $("#score").textContent =
    `${state.wood} wood · ${state.completed} ${state.completed === 1 ? "shelter" : "shelters"}`;
  renderActions(state, selection, action);
  renderStory(state);
}
export function showPortrait(texture) {
  const portrait = document.createElement("canvas");
  portrait.width = 48;
  portrait.height = 50;
  portrait
    .getContext("2d")
    .drawImage(texture.source.resource, 24, 14, 48, 50, 0, 0, 48, 50);
  $(".portrait-icon").innerHTML =
    `<img alt="Rowan, a human outsider" src="${portrait.toDataURL()}">`;
}
