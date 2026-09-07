import { commandProblem } from "./clearing.js";
import { BUILDINGS, placementProblem, shelteredBeds } from "./construction.js";
import { looseWood } from "./resources.js";
import { DAY_TICKS, hour } from "./jobs.js";
const $ = (selector) => document.querySelector(selector);
const ACTIVITIES = {
  idle: "Waiting for work",
  walk: "Walking",
  chop: "Chopping oak",
  pickup: "Picking up wood",
  deliver: "Delivering wood",
  build: "Building",
  sleep: "Sleeping in the bedroll",
};
function jobTitle(state, job) {
  if (job.kind === "chop") return `Chop oak ${job.target.split("-")[1]}`;
  if (job.kind === "rest")
    return job.routine ? "Sleep until morning" : "Rest in the bedroll";
  const site = state.sites.find((s) => s.id === job.target);
  return `${BUILDINGS[site.type].label} · ${site.x}, ${site.z}`;
}
let lastOrders = "";
function renderOrders(state) {
  const entries =
    state.jobs
      .map((job) => {
        const active = state.pawn.task?.job === job.id;
        const site = state.sites.find((s) => s.id === job.target);
        const detail = site
          ? `${site.delivered}/${BUILDINGS[site.type].wood} wood delivered`
          : "";
        return `<li class="${active ? "active-order" : ""}"><span><strong>${jobTitle(state, job)}</strong><small>${active ? ACTIVITIES[state.pawn.mode] : job.reason || "Ordered"}${detail ? ` · ${detail}` : ""}</small></span><button data-action="next" data-job="${job.id}" aria-label="Move ${jobTitle(state, job)} next" ${state.paused ? "disabled" : ""}>↑</button><button data-action="cancel" data-job="${job.id}" aria-label="Cancel ${jobTitle(state, job)}" ${state.paused ? "disabled" : ""}>×</button></li>`;
      })
      .join("") ||
    '<li class="empty-orders">Mark a tree or place a blueprint to give Rowan work.</li>';
  if (entries !== lastOrders) {
    $("#orders").innerHTML = entries;
    lastOrders = entries;
  }
  $("#order-count").textContent = `${state.jobs.length} waiting / working`;
}
function renderActions(state, selection) {
  $("#select").classList.toggle("selected", selection.pawn);
  $("#task").textContent = selection.tool ? "Finish placing" : "Order chopping";
  $("#task").disabled =
    !selection.tool &&
    (!selection.pawn ||
      !!commandProblem(state, { kind: "chop", tree: selection.tree }));
  for (const button of document.querySelectorAll("[data-build]")) {
    button.disabled = !selection.pawn || state.paused;
    button.classList.toggle(
      "selected",
      selection.tool === button.dataset.build,
    );
  }
  $("#rotate").disabled = !selection.tool;
  $("#rest").disabled =
    !selection.pawn ||
    state.paused ||
    state.jobs.some((j) => j.kind === "rest");
  $("#routine").disabled = !selection.pawn || state.paused;
  $("#routine").checked = state.routine;
  $("#pause").textContent = state.paused ? "▶" : "Ⅱ";
  $("#pause").setAttribute("aria-label", state.paused ? "Resume" : "Pause");
}
function renderStory(state) {
  $("#feed").textContent =
    `FAKE SHIITAKE · ${state.paused ? "paused" : state.demand ? `event ${state.feed.sequence} · simulated` : "seeded event pending"}`;
  $("#demand").hidden = !state.demand;
  $("#demand").textContent = state.demand
    ? `${state.demand.name.toUpperCase()}: “${state.demand.text}”`
    : "";
  $("#day").textContent =
    `DAY ${1 + Math.floor((state.tick + DAY_TICKS / 3) / DAY_TICKS)} · ${String(Math.floor(hour(state))).padStart(2, "0")}:${String(Math.floor((hour(state) % 1) * 60)).padStart(2, "0")}`;
}
export function renderHud(state, selection, notice) {
  const p = state.pawn,
    beds = shelteredBeds(state).length;
  $("#activity").textContent =
    `${ACTIVITIES[p.mode]}${p.carry ? ` · carrying ${p.carry} wood` : ""}`;
  $("#hint").textContent = !selection.pawn
    ? "Select Rowan, then choose work. He travels automatically."
    : selection.tool
      ? `${BUILDINGS[selection.tool].label} · ${BUILDINGS[selection.tool].wood} wood · ${selection.direction ? "rotated" : "front facing"}`
      : "First ready order runs. Waiting orders resume when materials arrive.";
  $("#notice").textContent = state.paused
    ? "Paused · work, wood and the world wait."
    : selection.tool
      ? placementProblem(state, {
          ...selection.at,
          type: selection.tool,
          direction: selection.direction,
        }) ||
        "Click or drag to order blueprints. R rotates. Escape finishes placement."
      : notice || state.notice;
  $("#score").textContent =
    `${looseWood(state)} wood on ground · ${p.carry} carried`;
  $("#rest-level").textContent = `REST ${Math.round(p.rest)}%`;
  $("#home-status").textContent = state.rested
    ? "Home used. Rowan has slept here; queued work continues."
    : beds
      ? "A dry bedroll. Order rest, or let the night schedule take over."
      : "Make an enclosed room, cover the bedroll's two cells with roof, then rest.";
  renderActions(state, selection);
  renderOrders(state);
  renderStory(state);
}
export function showPortrait(texture) {
  const portrait = document.createElement("canvas");
  portrait.width = 48;
  portrait.height = 50;
  portrait
    .getContext("2d")
    .drawImage(texture.source.resource, 16, 12, 48, 50, 0, 0, 48, 50);
  $(".portrait-icon").innerHTML =
    `<img alt="Rowan, a human outsider" src="${portrait.toDataURL()}">`;
}
