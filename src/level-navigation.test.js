import assert from "node:assert/strict";
import test from "node:test";
import { levelNavigationOwned } from "./keys.js";
import {
  DEBUG_PICKING_CONTROL,
  decideLevelTransition,
  dispatchUiAction,
  dispatchLevelAction,
  LEVEL_NAVIGATION,
  requiredToolLevel,
} from "./ui-actions.ts";

test("picking debug uses the checked UI action catalog and normal dispatcher", () => {
  assert.deepEqual(DEBUG_PICKING_CONTROL, {
    name: "view.debug-picking",
    label: "Picking debug",
    key: "shift+d",
    title: "Toggle picking geometry",
    action: { kind: "debug-picking" },
  });
  const forwarded = [];
  dispatchUiAction(DEBUG_PICKING_CONTROL.action, {
    run: (action) => forwarded.push(action),
    level: null,
  });
  assert.deepEqual(forwarded, [{ kind: "debug-picking" }]);
});

test("level navigation catalog owns labels, keys, actions, and limit state", () => {
  assert.deepEqual(
    LEVEL_NAVIGATION.map(({ name, level, label, key, action }) => ({
      name,
      level,
      label,
      key,
      action,
    })),
    [
      {
        name: "view.level.ground",
        level: 0,
        label: "Ground",
        key: "pagedown",
        action: { kind: "level", level: 0 },
      },
      {
        name: "view.level.upper",
        level: 1,
        label: "Upper",
        key: "pageup",
        action: { kind: "level", level: 1 },
      },
    ],
  );
  assert.equal(LEVEL_NAVIGATION[0].enabled(0), false);
  assert.equal(LEVEL_NAVIGATION[0].enabled(1), true);
  assert.equal(LEVEL_NAVIGATION[1].enabled(0), true);
  assert.equal(LEVEL_NAVIGATION[1].enabled(1), false);
});

test("tool level policy keeps ordinary buildings and constrains special tools", () => {
  for (const tool of ["wall", "door", "bed", "roof", "shelf"])
    assert.equal(requiredToolLevel(tool), null);
  assert.equal(requiredToolLevel("floor"), 1);
  for (const tool of ["stair", "chop", "herb"])
    assert.equal(requiredToolLevel(tool), 0);
});

test("level transition policy changes level and disarms only incompatible tools", () => {
  assert.deepEqual(decideLevelTransition(0, 0, "floor"), {
    changed: false,
    level: 0,
    disarm: false,
    notice: null,
  });
  assert.deepEqual(decideLevelTransition(0, 1, "wall"), {
    changed: true,
    level: 1,
    disarm: false,
    notice: null,
  });
  assert.deepEqual(decideLevelTransition(1, 0, "floor"), {
    changed: true,
    level: 0,
    disarm: true,
    notice:
      "Ground selected; the armed tool was disarmed because it is unavailable on this level.",
  });
  assert.deepEqual(decideLevelTransition(0, 1, "chop"), {
    changed: true,
    level: 1,
    disarm: true,
    notice:
      "Upper selected; the armed tool was disarmed because it is unavailable on this level.",
  });
});

test("typed level dispatcher owns the transition and does not forward it", () => {
  const calls = [];
  let level = 0;
  dispatchLevelAction(
    { kind: "level", level: 1 },
    {
      currentLevel: () => level,
      armedTool: () => "floor",
      resetGesture: () => calls.push("reset-gesture"),
      disarmTool: () => calls.push("disarm-tool"),
      setLevel: (value) => {
        level = value;
        calls.push(`level:${value}`);
      },
      clearInspection: () => calls.push("clear-inspection"),
      notice: (text) => calls.push(`notice:${text}`),
    },
  );
  assert.equal(level, 1);
  assert.deepEqual(calls, ["reset-gesture", "level:1", "clear-inspection"]);
});

test("level keys yield only to real input ownership", () => {
  const body = { parentElement: null, scrollHeight: 500, clientHeight: 500 };
  const button = {
    parentElement: body,
    scrollHeight: 40,
    clientHeight: 40,
    matches: (selector) => selector.includes("button"),
  };
  const input = {
    parentElement: body,
    scrollHeight: 40,
    clientHeight: 40,
    matches: (selector) => selector.startsWith("input"),
  };
  const scrollPanel = {
    parentElement: body,
    scrollHeight: 600,
    clientHeight: 300,
    matches: () => false,
  };
  const panelButton = {
    parentElement: scrollPanel,
    scrollHeight: 40,
    clientHeight: 40,
    matches: (selector) => selector.includes("button"),
  };
  const styles = new Map([
    [body, { overflowX: "hidden", overflowY: "hidden" }],
    [button, { overflowX: "visible", overflowY: "visible" }],
    [input, { overflowX: "visible", overflowY: "visible" }],
    [scrollPanel, { overflowX: "hidden", overflowY: "auto" }],
    [panelButton, { overflowX: "visible", overflowY: "visible" }],
  ]);
  const resolveStyle = (node) => styles.get(node);
  assert.equal(levelNavigationOwned({}, button, body, resolveStyle), false);
  assert.equal(levelNavigationOwned({}, input, body, resolveStyle), true);
  assert.equal(levelNavigationOwned({}, panelButton, body, resolveStyle), true);
  const visibleRoot = {
    parentElement: body,
    scrollWidth: 600,
    clientWidth: 390,
    scrollHeight: 500,
    clientHeight: 500,
    matches: () => false,
  };
  const hiddenRoot = { ...visibleRoot };
  const autoRoot = { ...visibleRoot };
  const rootButton = {
    parentElement: visibleRoot,
    scrollWidth: 40,
    clientWidth: 40,
    scrollHeight: 40,
    clientHeight: 40,
    matches: (selector) => selector.includes("button"),
  };
  styles.set(visibleRoot, { overflowX: "visible", overflowY: "visible" });
  styles.set(hiddenRoot, { overflowX: "hidden", overflowY: "hidden" });
  styles.set(autoRoot, { overflowX: "auto", overflowY: "hidden" });
  styles.set(rootButton, { overflowX: "visible", overflowY: "visible" });
  rootButton.parentElement = visibleRoot;
  assert.equal(levelNavigationOwned({}, rootButton, body, resolveStyle), false);
  rootButton.parentElement = hiddenRoot;
  assert.equal(levelNavigationOwned({}, rootButton, body, resolveStyle), false);
  rootButton.parentElement = autoRoot;
  assert.equal(levelNavigationOwned({}, rootButton, body, resolveStyle), true);
  assert.equal(
    levelNavigationOwned(
      { defaultPrevented: true },
      button,
      body,
      resolveStyle,
    ),
    true,
  );
});
