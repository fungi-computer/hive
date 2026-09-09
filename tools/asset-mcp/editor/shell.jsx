import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@fungi.computer/caps/components/button";
import "@fungi.computer/caps/styles.css";
import "../portable-fonts/caps/fonts.css";
import {
  sceneInputSchema,
  documentFromRecipe,
} from "../../../src/asset-pipeline/legacy-recipe.js";
import { parseSceneDocument } from "../../../src/asset-pipeline/scene-document.ts";
import { exportSceneDocument } from "../../../src/asset-pipeline/scene-geometry.js";
import recipe from "../examples/exports/baseline.recipe.json";
import { CHANNEL, MAX_BYTES, decode, encode } from "./protocol.js";
import "./shell.css";

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Studio() {
  const frame = useRef(null),
    file = useRef(null),
    callbacks = useRef(new Map());
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState("Loading the editor…");
  const request = (operation, bytes) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        callbacks.current.delete(id);
        reject(new Error("Editor request timed out"));
      }, 30000);
      callbacks.current.set(id, { resolve, reject, timeout });
      frame.current.contentWindow.postMessage(
        { channel: CHANNEL, id, operation, bytes },
        location.origin,
        bytes ? [bytes] : [],
      );
    });
  const bake = async (document) =>
    request("load-asset", encode(await exportSceneDocument(document)));
  const save = async (operation, name, type) => {
    try {
      download(await request(operation), name, type);
      setStatus(`Downloaded ${name}`);
    } catch (error) {
      setStatus(error.message);
    }
  };
  useEffect(() => {
    let disposed = false;
    const onMessage = async (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== CHANNEL
      )
        return;
      const data = event.data;
      if (data.event === "ready") {
        try {
          await bake(documentFromRecipe(sceneInputSchema.parse(recipe)));
          if (!disposed) {
            setReady(true);
            setStatus("Original workshop · editable baked scene");
          }
        } catch (error) {
          if (!disposed) setStatus(error.message);
        }
      } else if (data.event === "choose-file") file.current.click();
      else if (data.event === "save-project")
        void save(
          "export-project",
          "workshop.hive-project.json",
          "application/json",
        );
      else if (data.event === "scripts-disabled")
        setStatus("This asset workspace does not run project scripts.");
      else {
        const callback = callbacks.current.get(data.id);
        if (!callback) return;
        callbacks.current.delete(data.id);
        clearTimeout(callback.timeout);
        if (data.ok && data.bytes instanceof ArrayBuffer)
          callback.resolve(data.bytes);
        else callback.reject(new Error(decode(data.bytes).error));
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      disposed = true;
      window.removeEventListener("message", onMessage);
      for (const callback of callbacks.current.values()) {
        clearTimeout(callback.timeout);
        callback.reject(new Error("Editor closed"));
      }
      callbacks.current.clear();
      frame.current?.contentWindow.postMessage(
        { channel: CHANNEL, id: "dispose", operation: "dispose" },
        location.origin,
      );
    };
  }, []);
  const open = async (event) => {
    const chosen = event.target.files[0];
    event.target.value = "";
    if (!chosen) return;
    try {
      if (chosen.size > MAX_BYTES)
        throw new Error("Choose a file smaller than 32 MiB");
      const bytes = await chosen.arrayBuffer(),
        value = decode(bytes);
      let warnings = [];
      if (value.format === "hive-editor-project")
        warnings = decode(await request("load-project", bytes)).warnings;
      else
        await bake(
          value.assets
            ? documentFromRecipe(sceneInputSchema.parse(value))
            : parseSceneDocument(value),
        );
      setStatus(
        `Opened ${chosen.name}${warnings.length ? ` · ${warnings.join(" ")}` : ""}`,
      );
    } catch (error) {
      setStatus(error.message);
    }
  };
  return (
    <main className="studio">
      <header>
        <div>
          <strong>Hive asset studio</strong>
          <p>Original assets · full Three.js editor</p>
        </div>
        <nav aria-label="Studio actions">
          <Button
            disabled={!ready}
            variant="outline"
            onClick={() => file.current.click()}
          >
            Open project or recipe
          </Button>
          <Button
            disabled={!ready}
            onClick={() =>
              save(
                "export-project",
                "workshop.hive-project.json",
                "application/json",
              )
            }
          >
            Save project
          </Button>
          <Button
            disabled={!ready}
            variant="outline"
            onClick={() =>
              save("export-three", "workshop.three.json", "application/json")
            }
          >
            Three JSON
          </Button>
          <Button
            disabled={!ready}
            variant="outline"
            onClick={() =>
              save("export-glb", "workshop.glb", "model/gltf-binary")
            }
          >
            GLB
          </Button>
        </nav>
      </header>
      <p role="status">{status}</p>
      <iframe
        ref={frame}
        src="./frame.html"
        title="Full upstream Three.js asset editor"
        sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
      />
      <footer>
        Editor controls are upstream Three.js. Projects save full scene edits;
        original recipes remain provenance. File editing is local, with no
        shared live sync. Project scripts and publishing are disabled.
      </footer>
      <input hidden type="file" ref={file} accept=".json" onChange={open} />
    </main>
  );
}
createRoot(document.getElementById("root")).render(<Studio />);
