import * as THREE from "three";
import { Editor } from "./vendor/editor/js/Editor.js";
import { Viewport } from "./vendor/editor/js/Viewport.js";
import { Toolbar } from "./vendor/editor/js/Toolbar.js";
import { Sidebar } from "./vendor/editor/js/Sidebar.js";
import { Menubar } from "./vendor/editor/js/Menubar.js";
import { Resizer } from "./vendor/editor/js/Resizer.js";
import { Animation } from "./vendor/editor/js/Animation.js";
import { AnimationResizer } from "./vendor/editor/js/AnimationResizer.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { CHANNEL, encode, isRequest } from "./protocol.js";
import { createEditorSession } from "./session.js";

const editor = new Editor();
editor.config.setKey(
  "autosave",
  false,
  "settings/history",
  true,
  "language",
  "en",
);
THREE.ObjectLoader.registerGeometry("TextGeometry", TextGeometry);
let renderer;
editor.signals.rendererCreated.add((value) => {
  renderer = value;
});
const session = createEditorSession(editor, () => renderer);
// Native file routes must not bypass the admitted byte boundary.
editor.fromJSON = async () => {
  throw new Error("Open projects through the Hive file boundary");
};
editor.loader.loadFiles = () => announce("choose-file");
editor.loader.loadItemList = () => announce("choose-file");
const viewport = new Viewport(editor);
const toolbar = new Toolbar(editor);
for (const panel of [
  viewport,
  toolbar,
  new Sidebar(editor),
  new Menubar(editor),
  new Resizer(editor),
  new Animation(editor),
  new AnimationResizer(editor),
])
  document.body.appendChild(panel.dom);

function announce(event) {
  parent.postMessage({ channel: CHANNEL, event }, location.origin);
}
// Keep upstream controls intact for modeling. The shell owns admitted project
// files; native script execution, app publishing and video/player are not mounted.
function routeMenu(key, event) {
  const label = editor.strings.getKey(key);
  for (const element of document.querySelectorAll("#menubar .option")) {
    if (element.textContent !== label) continue;
    const replacement = element.cloneNode(true);
    element.replaceWith(replacement);
    replacement.addEventListener("click", () => announce(event));
  }
}
routeMenu("menubar/file/open", "choose-file");
routeMenu("menubar/file/import", "choose-file");
routeMenu("menubar/file/save", "save-project");
const unavailable = [
  "menubar/render/video",
  ...["Arkanoid", "Camera", "Particles", "Pong", "Shaders"].map(
    (name) => `menubar/file/new/${name}`,
  ),
];
for (const key of unavailable) {
  const label = editor.strings.getKey(key);
  for (const element of document.querySelectorAll("#menubar .option"))
    if (element.textContent === label) element.remove();
}
for (const element of document.querySelectorAll("#app, #scriptTab")) {
  element.inert = true;
  element.style.display = "none";
}
// No silent persistence into upstream's unversioned browser scene store.
for (const element of document.querySelectorAll("#menubar .right"))
  element.remove();
editor.signals.editScript.add(() => announce("scripts-disabled"));
editor.signals.animationPanelChanged.add((height) => {
  const visible = height !== false;
  viewport.dom.classList.toggle("with-animation", visible);
  toolbar.dom.classList.toggle("with-animation", visible);
  viewport.dom.style.bottom = visible ? `${height}px` : "";
  toolbar.dom.style.bottom = visible ? `${height + 20}px` : "";
  editor.signals.windowResize.dispatch();
});
window.addEventListener("resize", () => editor.signals.windowResize.dispatch());
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => {
  if (event.dataTransfer.types[0] === "text/plain") return; // Native hierarchy drag.
  event.preventDefault();
  announce("choose-file");
});
let pending = Promise.resolve();
window.addEventListener("message", (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== parent ||
    !isRequest(event.data)
  )
    return;
  const request = event.data;
  pending = pending.then(async () => {
    document.body.inert = true;
    try {
      const bytes = await session.execute(request.operation, request.bytes);
      parent.postMessage(
        { channel: CHANNEL, id: request.id, ok: true, bytes },
        location.origin,
        [bytes],
      );
    } catch (error) {
      const bytes = encode({
        error:
          error instanceof Error ? error.message : "Editor operation failed",
      });
      parent.postMessage(
        { channel: CHANNEL, id: request.id, ok: false, bytes },
        location.origin,
        [bytes],
      );
    } finally {
      document.body.inert = false;
    }
  });
});
window.addEventListener("pagehide", () => {
  void session.execute("dispose");
});
editor.signals.windowResize.dispatch();
// Readiness means resource construction completed, not a rendered-art proof.
announce("ready");
