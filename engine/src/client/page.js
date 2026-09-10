import "./client.css";
import "@fungi.computer/caps/styles.css";
import "@fungi.computer/stipe/styles.css";
import { createHiveClient } from "./client.js";

const mode = document.body.dataset.mode || "hub";
const configs = {
  colony: { title: "Colony", subtitle: "Select workers and send a shared delivery order.", source: "./src/games/colony.ts" },
  survival: { title: "Survival", subtitle: "One survivor, one body, and direct actions through the same client.", source: "./src/games/survival.ts" },
  formations: { title: "Formations", subtitle: "Select a group, set a destination, and practice a morale rule.", source: "./src/games/formations.ts" },
};
const root = document.querySelector("#hive-app");
const queryMode = new URLSearchParams(location.search).get("game");
if (mode === "hub" && configs[queryMode]) {
  root.className = "hive-shell";
  createHiveClient({ root, mode: queryMode, ...configs[queryMode] });
} else if (mode === "hub") {
  root.innerHTML = `<div class="hive-hub"><div class="hive-kicker">HIVE / FRESH ENGINE</div><h1>Three small worlds, one client</h1><p>Choose a world. Each tab keeps its own runtime identity while sharing the same camera, controls, HUD, and original Goblin static art bank.</p><div class="hive-links"><a href="./?game=colony"><strong>Colony</strong><span>Shared workers and finite food</span></a><a href="./?game=survival"><strong>Survival</strong><span>Direct body actions and condition</span></a><a href="./?game=formations"><strong>Formations</strong><span>Group orders and morale</span></a></div><a href="../index.html">Open the old Goblin game ↗</a></div>`;
} else {
  const config = configs[mode] || configs.colony;
  root.className = "hive-shell";
  createHiveClient({ root, mode, ...config });
}
