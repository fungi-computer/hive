import { createDefaultHtmlKeymap } from "@opentui/keymap/html";
import {
  createBindingLookup,
  formatCommandBindings,
} from "@opentui/keymap/extras";
import { DEBUG_PICKING_CONTROL, LEVEL_NAVIGATION } from "./ui-actions.ts";

const LEVEL_INPUT_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='checkbox']";
export const MINIMAP_INPUT_SELECTOR = "[data-clearing-minimap-control]";
const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

function actuallyScrollable(node, resolveStyle) {
  const style = resolveStyle(node);
  return (
    (SCROLLABLE_OVERFLOW.has(style.overflowX) &&
      node.scrollWidth > node.clientWidth) ||
    (SCROLLABLE_OVERFLOW.has(style.overflowY) &&
      node.scrollHeight > node.clientHeight)
  );
}

export function levelNavigationOwned(
  nativeEvent,
  activeElement,
  body,
  resolveStyle = (node) => globalThis.getComputedStyle(node),
) {
  if (nativeEvent?.defaultPrevented) return true;
  if (!activeElement) return false;
  if (activeElement.matches?.(LEVEL_INPUT_SELECTOR)) return true;
  let node = activeElement;
  while (node) {
    if (actuallyScrollable(node, resolveStyle)) return true;
    if (node === body) break;
    node = node.parentElement;
  }
  return false;
}

export function minimapInputOwned(nativeEvent, activeElement) {
  if (!activeElement?.closest?.(MINIMAP_INPUT_SELECTOR)) return false;
  return [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Enter",
    " ",
  ].includes(nativeEvent?.key);
}

// Game actions are local; OpenTUI owns physical keys, matching and hint formatting.
export function createKeys(root, read, send, changed) {
  const keymap = createDefaultHtmlKeymap(root);
  const definitions = [
    {
      name: "ui.close",
      key: "escape",
      title: "Close / cancel placement",
      action: () => ({ kind: "close" }),
    },
    {
      name: "build.rotate",
      key: "r",
      title: "Rotate footprint",
      enabled: () => !!read().tool,
      action: () => ({ kind: "rotate" }),
    },
    {
      name: "sim.pause",
      key: "space",
      title: "Pause / resume",
      enabled: () => !document.activeElement?.closest("button, a"),
      action: () => ({ kind: "pause" }),
    },
    {
      name: "panel.build",
      key: "b",
      title: "Build",
      action: () => ({ kind: "panel", panel: "build" }),
    },
    {
      name: "panel.orders",
      key: "o",
      title: "Orders",
      action: () => ({ kind: "panel", panel: "orders" }),
    },
    {
      name: "camera.focus",
      key: "f",
      title: "Center on selection",
      action: () => ({ kind: "focus" }),
    },
    {
      name: "view.cutaway",
      key: "h",
      title: "Toggle cutaway",
      action: () => ({ kind: "cutaway", value: !read().cutaway }),
    },
    {
      name: DEBUG_PICKING_CONTROL.name,
      key: DEBUG_PICKING_CONTROL.key,
      title: DEBUG_PICKING_CONTROL.title,
      action: () => ({ ...DEBUG_PICKING_CONTROL.action }),
    },
    {
      name: "help",
      key: "f1",
      title: "Bramble's advice",
      action: () => ({ kind: "help" }),
    },
    {
      name: "tree.chop",
      key: "c",
      title: "Prioritize or mark oak",
      enabled: () => !!read().context && read().chopAllowed,
      action: () => {
        const selected = read().selectedIds;
        return {
          kind: "command",
          command: {
            kind: "chop",
            tree: read().tree,
            direct: !!selected.length,
            actors: selected.length ? [...selected] : null,
          },
        };
      },
    },
    {
      name: "tree.chop-queued",
      key: "shift+c",
      title: "Queue or mark oak",
      enabled: () => !!read().context && read().chopAllowed,
      action: () => {
        const selected = read().selectedIds;
        return {
          kind: "command",
          command: {
            kind: "chop",
            tree: read().tree,
            direct: false,
            actors: selected.length ? [...selected] : null,
          },
        };
      },
    },
    {
      name: "camera.left",
      key: "left",
      title: "Pan left",
      repeat: true,
      action: () => ({ kind: "pan", x: 24, y: 0 }),
    },
    {
      name: "camera.right",
      key: "right",
      title: "Pan right",
      repeat: true,
      action: () => ({ kind: "pan", x: -24, y: 0 }),
    },
    {
      name: "camera.up",
      key: "up",
      title: "Pan up",
      repeat: true,
      action: () => ({ kind: "pan", x: 0, y: 24 }),
    },
    {
      name: "camera.down",
      key: "down",
      title: "Pan down",
      repeat: true,
      action: () => ({ kind: "pan", x: 0, y: -24 }),
    },
    ...LEVEL_NAVIGATION.map((control) => ({
      name: control.name,
      key: control.key,
      title: control.title,
      levelNavigation: true,
      enabled: () => control.enabled(read().level),
      action: () => ({ ...control.action }),
    })),
  ];
  function pageNavigationOwned(event) {
    return levelNavigationOwned(
      event.originalEvent,
      document.activeElement,
      document.body,
    );
  }
  const lookup = createBindingLookup(
    Object.fromEntries(definitions.map((d) => [d.name, d.key])),
  );
  keymap.registerLayer({
    target: root,
    targetMode: "focus-within",
    enabled: () =>
      !document.activeElement?.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
      ),
    bindings: lookup.bindings,
    commands: definitions.map((d) => ({
      name: d.name,
      desc: d.title,
      enabled: d.enabled ?? true,
      run({ event }) {
        if (
          event.originalEvent?.isComposing ||
          (event.originalEvent?.repeat && !d.repeat)
        )
          return;
        if (minimapInputOwned(event.originalEvent, document.activeElement))
          return false;
        if (d.levelNavigation && pageNavigationOwned(event)) return;
        send(d.action());
      },
    })),
  });
  keymap.on("state", changed);
  return {
    hints() {
      const bindings = keymap.getCommandBindings({
        commands: definitions.map((d) => d.name),
        visibility: "active",
      });
      return Object.fromEntries(
        definitions.map((d) => [
          d.name,
          {
            title: d.title,
            key:
              formatCommandBindings(bindings.get(d.name), {
                keyNameAliases: {
                  space: "Space",
                  escape: "Esc",
                  pageup: "PageUp",
                  pagedown: "PageDown",
                  left: "←",
                  right: "→",
                  up: "↑",
                  down: "↓",
                },
              }) || "",
          },
        ]),
      );
    },
  };
}
