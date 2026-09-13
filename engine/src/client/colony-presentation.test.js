import { strict as assert } from "node:assert";
import test from "node:test";
import { colonyControl, selectedBrewStation } from "./colony-presentation.js";

test("the selected retained brew station is identified from the visible world fact", () => {
  const station = { id: "site-1", visual: "colony.brew-station.profile.finished" };
  assert.equal(selectedBrewStation([station], ["site-1"]), station);
  assert.equal(selectedBrewStation([station], ["worker-1"]), null);
});

test("planting uses the existing semantic control by its local binding", () => {
  const control = { id: "sow-mugwort", commandId: "colony:sowMugwort", target: "terrain-cell" };
  assert.equal(colonyControl([control], "sow-mugwort"), control);
  assert.equal(colonyControl([], "sow-mugwort"), null);
});
