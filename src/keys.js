import { createDefaultHtmlKeymap } from "@opentui/keymap/html";
import {
  createBindingLookup,
  formatCommandBindings,
} from "@opentui/keymap/extras";

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
      name: "help",
      key: "f1",
      title: "Bramble's advice",
      action: () => ({ kind: "help" }),
    },
    {
      name: "tree.chop",
      key: "c",
      title: "Chop selected oak",
      enabled: () => !!read().context && read().chopAllowed,
      action: () => ({
        kind: "command",
        command: { kind: "chop", tree: read().tree },
      }),
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
  ];
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
