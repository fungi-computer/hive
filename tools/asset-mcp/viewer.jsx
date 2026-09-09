import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { Button } from "@fungi.computer/caps/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@fungi.computer/caps/components/card";
import "@fungi.computer/caps/styles.css";
import "./portable-fonts/caps/fonts.css";
import { camera } from "../../src/art/prop-camera.js";
import "./viewer.css";

const artifacts =
  new URLSearchParams(location.search).get("artifacts") || "./exports/";
const base = new URL(
  artifacts.endsWith("/") ? artifacts : `${artifacts}/`,
  location.href,
);
if (base.origin !== location.origin)
  throw new Error("Workshop artifacts must share this viewer's origin");
const file = (name) => new URL(name, base).href;
const views = new Map();
window.__HIVE_ASSET_VIEWER__ = { views, ready: false };

async function loadArtifact(name) {
  const response = await fetch(file(`${name}.three.json`));
  if (!response.ok) throw new Error(`Export unavailable (${response.status})`);
  const bytes = await response.text();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(bytes),
  );
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return { scene: new THREE.ObjectLoader().parse(JSON.parse(bytes)), sha256 };
}

function Preview({ name, title }) {
  const host = useRef(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    let stopped = false;
    let dispose = () => {};
    loadArtifact(name)
      .then(({ scene, sha256 }) => {
        const geometries = new Set(),
          materials = new Set();
        scene.traverse((node) => {
          if (node.geometry) geometries.add(node.geometry);
          for (const material of Array.isArray(node.material)
            ? node.material
            : node.material
              ? [node.material]
              : [])
            materials.add(material);
        });
        const releaseAsset = () => {
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
        };
        if (stopped) {
          releaseAsset();
          return;
        }
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(1);
        renderer.setSize(256, 256, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0, 0);
        const canvas = renderer.domElement;
        canvas.setAttribute("aria-label", `${title} exported Three scene`);
        host.current.replaceChildren(canvas);
        const bounds = new THREE.Box3().setFromObject(scene);
        const center = bounds.getCenter(new THREE.Vector3());
        const view = camera(256, 256, center.y);
        const offset = view.position
          .clone()
          .sub(new THREE.Vector3(0, center.y, 0));
        const corners = [];
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
              corners.push(new THREE.Vector3(x, y, z));
        const facts = {
          sha256,
          renderer,
          scene,
          camera: view,
          renders: 0,
          turn: 0,
        };
        const draw = (angle = 0) => {
          view.position
            .copy(offset)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), (angle * Math.PI) / 2)
            .add(center);
          view.lookAt(center);
          view.zoom = 1;
          view.updateProjectionMatrix();
          view.updateMatrixWorld(true);
          const projected = corners.map((corner) =>
            corner.clone().project(view),
          );
          view.zoom =
            0.83 /
            Math.max(
              ...projected.flatMap((point) => [
                Math.abs(point.x),
                Math.abs(point.y),
              ]),
            );
          view.updateProjectionMatrix();
          renderer.render(scene, view);
          facts.renders++;
          facts.turn = angle;
        };
        facts.draw = draw;
        views.set(name, facts);
        draw();
        setLoaded(true);
        window.__HIVE_ASSET_VIEWER__.ready = views.size === 2;
        dispose = () => {
          views.delete(name);
          releaseAsset();
          renderer.dispose();
          canvas.remove();
        };
      })
      .catch((failure) => {
        if (!stopped) setError(failure.message);
      });
    return () => {
      stopped = true;
      dispose();
    };
  }, [name, title]);
  useEffect(() => {
    views.get(name)?.draw(turn);
  }, [name, turn]);
  return (
    <Card variant="surface" className="asset-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="asset-canvas" ref={host} />
        {error && <p role="alert">{error}</p>}
        <div className="asset-actions">
          <Button
            variant="outline"
            disabled={!loaded}
            onClick={() => setTurn((value) => value + 1)}
          >
            Turn {title.toLowerCase()}
          </Button>
          <Button asChild variant="outline">
            <a href={file(`${name}.three.json`)} download>
              Download Three scene
            </a>
          </Button>
          <a href={file(`${name}.recipe.json`)} download>
            Recipe
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function Workshop() {
  return (
    <main className="asset-workshop">
      <nav aria-label="Workshop navigation">
        <a href="https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/">
          Play the clearing
        </a>
      </nav>
      <header>
        <p className="asset-eyebrow">
          COPPER FAMILIAR · AN ORIGINAL ASSET WORKSHOP
        </p>
        <h1>A little workshop. Yours to rearrange.</h1>
        <p>
          These two scenes came back from real MCP tool calls. The second has a
          wider, turned bench and a green potion bottle. Both use the same
          original builders as our inn.
        </p>
      </header>
      <div className="asset-comparison">
        <Preview name="baseline" title="Before" />
        <Preview name="variant" title="After" />
      </div>
      <Card variant="outline">
        <CardContent className="asset-footnote">
          <p>
            Turn the exported geometry, download it, or change its recipe with
            your agent. This page renders saved MCP results; it does not make a
            live MCP call.
          </p>
          <a href={file("mcp-receipt.json")}>Inspect the actual MCP receipt</a>
        </CardContent>
      </Card>
    </main>
  );
}

createRoot(document.querySelector("#root")).render(<Workshop />);
