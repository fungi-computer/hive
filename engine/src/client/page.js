import "./client.css";
import { PIRATE_VISUAL_BINDINGS } from "./visual-bindings.js";
import "@fungi.computer/caps/styles.css";
import "@fungi.computer/stipe/fonts.css";
import { createHiveClient } from "./client.js";
import { connectBrowserRuntime } from "../runtime/browser-client.js";

const mode = document.body.dataset.mode || "hub";
const configs = {
  pirates: {
    title: "Timber raft",
    environment: "water",
    visualBindings: PIRATE_VISUAL_BINDINGS,
    subtitle: "Sail the raft, walk its deck, and carry finite supplies into the hold. Save and continue your voyage.",
    controlHelp: "Sail: click an empty deck corner, then right-click water. Walk: click a crew member, then right-click the deck.",
    orderCommand: "move",
    source: "./source/pirates.ts",
  },
  colony: {
    title: "Colony",
    subtitle:
      "Choose a one- or two-piece food delivery. Pause the worker mid-trip, inspect the carried food, then resume.",
    source: "./source/colony.ts",
  },
  survival: {
    title: "Survival",
    subtitle:
      "Take and eat finite bread, watch hunger, and change how much a meal restores.",
    source: "./source/survival.ts",
  },
  formations: {
    title: "Formations",
    orderCommand: "march",
    subtitle:
      "Choose facing, drag-select your group, and right-click to march around the crate. Raise the retreat threshold to send them home.",
    source: "./source/formations.ts",
  },
};
const root = document.querySelector("#hive-app");
const queryMode = new URLSearchParams(location.search).get("game");
if (mode === "hub" && configs[queryMode]) {
  root.className = "hive-shell";
  const runtime = connectBrowserRuntime();
  createHiveClient({ root, mode: queryMode, runtime, ...configs[queryMode] });
} else if (mode === "hub") {
  root.innerHTML = `<div class="hive-hub"><div class="hive-kicker">HIVE / FRESH ENGINE</div><h1>Four small worlds, one client</h1><p>Choose a world. Each tab keeps its own runtime identity while sharing the same camera, controls, HUD, and original Goblin static art bank.</p><div class="hive-links"><a href="./?game=colony"><strong>Colony</strong><span>Shared workers and finite food</span></a><a href="./?game=survival"><strong>Survival</strong><span>Direct body actions and condition</span></a><a href="./?game=formations"><strong>Formations</strong><span>Group orders and morale</span></a><a href="./?game=pirates"><strong>Timber raft</strong><span>Moving decks and shared cargo</span></a></div><a href="../index.html">Open the old Goblin game ↗</a></div>`;
} else {
  const config = configs[mode] || configs.colony;
  root.className = "hive-shell";
  const runtime = connectBrowserRuntime();
  createHiveClient({ root, mode, runtime, ...config });
}
