import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Application, Sprite } from "pixi.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@fungi.computer/caps/components/card";
import { Button } from "@fungi.computer/caps/components/button";
import "@fungi.computer/caps/styles.css";
import "./style.css";
import { loadStaticArtPack } from "../../art/static-pack.js";
import { buildingVisualPlacement } from "../../construction.js";
import { projectCell } from "../../art/scale.js";
import { structureDepth } from "../../visual-order.js";
import { wallMask } from "../../wall-appearance.js";
import {
  VERTICAL_LAYOUT,
  VERTICAL_LAYOUT_LABEL,
} from "../../fixtures/vertical-layout.ts";

const WIDTH = 640;
const HEIGHT = 400;
const LAYERS = [
  ["whole", "Whole building"],
  ["cutaway", "Cutaway"],
  ["ground", "Ground"],
  ["upper-1", "Storey +1"],
  ["upper-2", "Storey +2"],
  ["roof", "Roof"],
];

function showSite(site, layer) {
  if (layer === "whole" || layer === "cutaway") return true;
  if (layer === "ground") return site.level === 0;
  if (layer === "upper-1") return site.level === 1;
  if (layer === "upper-2") return site.level === 2;
  return site.level === 3;
}

function displaySite(site, art, sites) {
  const finished = { ...site, direction: 0, work: 0, finishedAt: 0 };
  const texture =
    site.type === "wall"
      ? art.wallJoints.finished[wallMask(finished, sites)]
      : art.buildings[site.type].finished[finished.direction];
  const sprite = new Sprite(texture);
  sprite.anchor.set(art.propAnchor.x, art.propAnchor.y);
  const at = projectCell(buildingVisualPlacement(finished));
  sprite.position.set(at.x, at.y);
  sprite.zIndex = structureDepth(finished);
  sprite.eventMode = "none";
  sprite.verticalSite = site;
  sprite.verticalCutaway =
    site.type === "roof" ||
    ((site.type === "wall" || site.type === "door") &&
      (site.x === 7 || site.z === 7));
  return sprite;
}

function VerticalStudy() {
  const stageRef = useRef(null);
  const appRef = useRef(null);
  const [layer, setLayer] = useState("cutaway");
  const [zoom, setZoom] = useState(1);
  const layerRef = useRef(layer);
  const zoomRef = useRef(zoom);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading the checked original art bank…");
  useEffect(() => {
    let cancelled = false;
    let pack;
    let app;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      app?.destroy(true, { children: true, texture: false, textureSource: false });
      pack?.dispose();
    };
    async function start() {
      try {
        pack = await loadStaticArtPack({
          onProgress: ({ detail }) => {
            if (!cancelled) setStatus(`${detail}…`);
          },
        });
        if (cancelled) {
          release();
          return;
        }
        app = new Application();
        await app.init({
          width: WIDTH,
          height: HEIGHT,
          backgroundAlpha: 0,
          antialias: false,
          resolution: 1,
          preference: "webgl",
        });
        if (cancelled) {
          release();
          return;
        }
        app.canvas.setAttribute("aria-label", "Three-storey authored layout");
        stageRef.current.append(app.canvas);
        appRef.current = app;
        const sprites = VERTICAL_LAYOUT.map((site) =>
          displaySite(site, pack.art, VERTICAL_LAYOUT),
        );
        for (const sprite of sprites) app.stage.addChild(sprite);
        app.stage.sortableChildren = true;
        for (const child of app.stage.children) {
          child.visible = showSite(child.verticalSite, layerRef.current);
          child.alpha =
            layerRef.current === "cutaway" && child.verticalCutaway ? 0.24 : 1;
        }
        app.stop();
        const bounds = app.stage.getLocalBounds();
        app.stage.pivot.set(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        const fit = Math.min(
          (WIDTH - 32) / bounds.width,
          (HEIGHT - 32) / bounds.height,
          1.2,
        );
        zoomRef.current = fit;
        app.stage.scale.set(fit);
        app.stage.position.set(WIDTH / 2, HEIGHT / 2);
        app.render();
        setZoom(fit);
        setReady(true);
        setStatus(`${VERTICAL_LAYOUT_LABEL} · ${VERTICAL_LAYOUT.length} authored pieces`);
      } catch (error) {
        release();
        if (!cancelled) setStatus(`Original art could not load: ${error.message}`);
      }
    }
    start();
    return () => {
      cancelled = true;
      release();
      appRef.current = null;
      setReady(false);
      stageRef.current?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    layerRef.current = layer;
    zoomRef.current = zoom;
    const app = appRef.current;
    if (!app) return;
    for (const child of app.stage.children) {
      child.visible = showSite(child.verticalSite, layer);
      child.alpha = layer === "cutaway" && child.verticalCutaway ? 0.24 : 1;
    }
    app.stage.scale.set(zoom);
    app.stage.position.set(WIDTH / 2, HEIGHT / 2);
    app.render();
  }, [layer, zoom]);

  return (
    <>
      <p className="eyebrow">HIVE · ORIGINAL BUILDING LAYOUT</p>
      <h1>Three storeys, one support route</h1>
      <p className="intro">
        An explorable art study of the finite room-and-platform fixture used by
        the vertical support and navigation law.
      </p>
      <Card variant="outline">
        <CardHeader>
          <CardTitle>Authored vertical fixture</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="controls" role="group" aria-label="Building layer">
            {LAYERS.map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={layer === id ? "primary" : "outline"}
                aria-pressed={layer === id}
                disabled={!ready}
                onClick={() => setLayer(id)}
              >
                {label}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={!ready} onClick={() => setZoom((value) => Math.max(0.7, value - 0.2))}>
              Zoom −
            </Button>
            <Button size="sm" variant="outline" disabled={!ready} onClick={() => setZoom((value) => Math.min(1.8, value + 0.2))}>
              Zoom +
            </Button>
          </div>
          <div className="stage" ref={stageRef} data-layer={layer} />
          <p className="layer-status" role="status">
            {LAYERS.find(([id]) => id === layer)?.[1]} · {VERTICAL_LAYOUT.filter((site) => showSite(site, layer)).length} of {VERTICAL_LAYOUT.length} authored pieces visible · zoom {zoom.toFixed(1)}×
          </p>
        </CardContent>
      </Card>
      <p className="note">{VERTICAL_LAYOUT_LABEL}</p>
      <p className="note">
        The study shares the law’s authored coordinates and prepared original
        sprites. It does not run construction, award timber, mutate a player
        save, or claim a playable game build.
      </p>
    </>
  );
}

createRoot(document.querySelector("#vertical-study")).render(<VerticalStudy />);
