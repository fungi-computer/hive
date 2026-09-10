import assert from "node:assert/strict";
import test from "node:test";
import { quantizedVisibleArea, subscribeCameraPresentation } from "./camera.js";
import { levelNavigationOwned, minimapInputOwned } from "./keys.js";
import {
  DEBUG_PICKING_CONTROL,
  cameraMoveKeepsTool,
  decideLevelTransition,
  dispatchUiAction,
  dispatchLevelAction,
  LEVEL_NAVIGATION,
  localGoodsAt,
  requiredToolLevel,
} from "./ui-actions.ts";

test("local goods projection returns only loose lots at the exact signed physical footing", () => {
  const woodHere = {
    id: "lot-wood",
    location: { kind: "ground", x: -2, y: 14, z: 122 },
  };
  assert.deepEqual(
    localGoodsAt(
      [
        woodHere,
        { id: "upper", location: { kind: "ground", x: -2, y: 15, z: 122 } },
        { id: "elsewhere", location: { kind: "ground", x: -1, y: 14, z: 122 } },
        { id: "hand", location: { kind: "hand", actor: "rowan" } },
        {
          id: "shelf",
          location: { kind: "container", container: "shelf:site-1" },
        },
      ],
      { x: -2, y: 14, z: 122 },
    ),
    [woodHere],
  );
});

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

test("minimap focus owns arrows and activation without taking Escape", () => {
  const minimap = {
    closest: (selector) =>
      selector === "[data-clearing-minimap-control]" ? minimap : null,
  };
  for (const key of [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Enter",
    " ",
  ])
    assert.equal(minimapInputOwned({ key }, minimap), true);
  assert.equal(minimapInputOwned({ key: "Escape" }, minimap), false);
  assert.equal(minimapInputOwned({ key: "ArrowLeft" }, null), false);

  const forwarded = [];
  dispatchUiAction(
    { kind: "recenter", cell: { x: 7, z: 6, level: 1 } },
    { run: (action) => forwarded.push(action), level: null },
  );
  assert.deepEqual(forwarded, [
    { kind: "recenter", cell: { x: 7, z: 6, level: 1 } },
  ]);
});

test("camera movement returns an armed tool to ready and no tool to idle", () => {
  assert.equal(cameraMoveKeepsTool("wall"), true);
  assert.equal(cameraMoveKeepsTool("chop"), true);
  assert.equal(cameraMoveKeepsTool(null), false);
});

test("camera visible area converts quantized cell centers to clipped grid edges", () => {
  const visible = quantizedVisibleArea(
    [
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 3 },
      { x: 0, z: 3 },
    ],
    15,
  );
  assert.deepEqual(visible, [
    { x: 0.5, z: 0.5 },
    { x: 3.5, z: 0.5 },
    { x: 3.5, z: 3.5 },
    { x: 0.5, z: 3.5 },
  ]);
  const clipped = quantizedVisibleArea(
    [
      { x: -5, z: -5 },
      { x: 20, z: -5 },
      { x: 20, z: 20 },
      { x: -5, z: 20 },
    ],
    15,
  );
  assert.ok(clipped.every((point) => point.x >= 0 && point.x <= 15));
  assert.ok(clipped.every((point) => point.z >= 0 && point.z <= 15));
});

test("camera presentation subscription detaches for BFCache and reattaches once", () => {
  const listeners = new Map();
  const target = {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
  let subscriptions = 0;
  let unsubscribed = 0;
  let updates = 0;
  const camera = {
    subscribe() {
      subscriptions++;
      return () => unsubscribed++;
    },
  };
  const dispose = subscribeCameraPresentation(camera, () => updates++, target);
  assert.deepEqual(
    { subscriptions, unsubscribed, updates },
    { subscriptions: 1, unsubscribed: 0, updates: 1 },
  );
  listeners.get("pagehide")({ persisted: true });
  assert.deepEqual(
    { subscriptions, unsubscribed, updates },
    { subscriptions: 1, unsubscribed: 1, updates: 1 },
  );
  listeners.get("pageshow")({ persisted: true });
  listeners.get("pageshow")({ persisted: true });
  assert.deepEqual(
    { subscriptions, unsubscribed, updates },
    { subscriptions: 2, unsubscribed: 1, updates: 2 },
  );
  listeners.get("pagehide")({ persisted: false });
  assert.deepEqual(
    { subscriptions, unsubscribed, updates },
    { subscriptions: 2, unsubscribed: 2, updates: 2 },
  );
  assert.equal(listeners.size, 0);
  dispose();
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
