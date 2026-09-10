import "./client.css";
import "@fungi.computer/caps/styles.css";
import "@fungi.computer/stipe/fonts.css";
import { createHiveClient } from "./client.js";
import { connectBrowserRuntime } from "../runtime/browser-client.js";

const mode = document.body.dataset.mode || "hub";
const configs = {
  colony: {
    title: "Colony",
    subtitle: "A worker carries one finite meal to a hungry guest; interrupt and watch custody resume.",
    source: "./source/colony.ts",
  },
  survival: {
    title: "Survival",
    subtitle:
      "One survivor, one body, and direct actions through the same client.",
    source: "./source/survival.ts",
  },
  formations: {
    title: "Formations",
    orderCommand: "march",
    subtitle: "Select a small group and set a destination; the formation marches together.",
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
  root.innerHTML = `<div class="hive-hub"><div class="hive-kicker">HIVE / FRESH ENGINE</div><h1>Three small worlds, one client</h1><p>Choose a world. Each tab keeps its own runtime identity while sharing the same camera, controls, HUD, and original Goblin static art bank.</p><div class="hive-links"><a href="./?game=colony"><strong>Colony</strong><span>Shared workers and finite food</span></a><a href="./?game=survival"><strong>Survival</strong><span>Direct body actions and condition</span></a><a href="./?game=formations"><strong>Formations</strong><span>Group orders and morale</span></a></div><a href="../index.html">Open the old Goblin game ↗</a></div>`;
} else {
  const config = configs[mode] || configs.colony;
  root.className = "hive-shell";
  const runtime = connectBrowserRuntime();
  createHiveClient({ root, mode, runtime, ...config });
}
