import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@fungi.computer/caps/components/badge";
import { Button } from "@fungi.computer/caps/components/button";
import { Card, CardContent } from "@fungi.computer/caps/components/card";
import "@fungi.computer/caps/styles.css";
import { AIR_VISUAL_SCALE, createBrewhouseAirView } from "./view.js";
import "./style.css";

const LAYERS = [
  ["ground", "Ground"],
  ["upstairs", "Upstairs"],
  ["cutaway", "Cutaway"],
  ["exterior", "Exterior"],
];

function format(value, digits = 5) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(
    value,
  );
}

function explain(error) {
  if (error === "fuel-already-used")
    return "The one stocked wood dose has already been used.";
  if (error === "opening-unchanged")
    return "The upper shutter is already in that position.";
  return `The local room rejected that request: ${error}`;
}

function noticeFor(data, previousTime) {
  switch (data.action) {
    case "ignite":
      return "One wood unit paid for a six-second heat and tracer dose. Advance time to release it.";
    case "vent":
      return `Upper shutter ${data.scene.result.ventOpen ? "opened" : "closed"}. This changes the measured path; it is not a safety claim.`;
    case "advance":
      return `Advanced the room by ${data.result.timeS - previousTime} seconds.`;
    case "reopen":
      return "Reopened the browser-local checkpoint through the same strict room parser.";
    case "reset":
      return "Started a new closed room with one wood unit in the hearth.";
    default:
      return "The authored brewhouse is ready. The upper shutter starts closed.";
  }
}

function RoomControls({ busy, result, scene, send, turnView }) {
  return (
    <div className="air-actions" aria-label="Room controls">
      <Button
        size="sm"
        disabled={busy || !result || result.fuelUnits === 0}
        onClick={() => send("ignite")}
      >
        Ignite 1 wood
      </Button>
      <Button
        size="sm"
        disabled={busy || !result}
        onClick={() => send("advance", { seconds: 1 })}
      >
        Advance 1 second
      </Button>
      <Button
        size="sm"
        disabled={busy || !result}
        onClick={() => send("advance", { seconds: 6 })}
      >
        Advance 6 seconds
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !result}
        onClick={() => send("vent", { open: !result.ventOpen })}
      >
        {result?.ventOpen ? "Close" : "Open"} upper shutter
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !scene}
        onClick={turnView}
      >
        Turn view
      </Button>
    </div>
  );
}

function LayerControls({ scene, layer, select }) {
  return (
    <div className="air-view-controls" aria-label="Visible storey">
      {LAYERS.map(([value, label]) => (
        <Button
          key={value}
          size="sm"
          variant={layer === value ? "primary" : "outline"}
          disabled={!scene}
          onClick={() => select(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function FieldControls({
  scene,
  showHeat,
  showSmoke,
  toggleHeat,
  toggleSmoke,
}) {
  return (
    <div className="air-field-controls" aria-label="Measured air fields">
      <Button
        size="sm"
        variant={showHeat ? "primary" : "outline"}
        disabled={!scene}
        aria-pressed={showHeat}
        onClick={toggleHeat}
      >
        Heat field
      </Button>
      <Button
        size="sm"
        variant={showSmoke ? "primary" : "outline"}
        disabled={!scene}
        aria-pressed={showSmoke}
        onClick={toggleSmoke}
      >
        Tracer field
      </Button>
    </div>
  );
}

function RoomFacts({ result }) {
  if (!result) return null;
  return (
    <dl className="air-facts" data-brewhouse-air-facts>
      <div>
        <dt>Physical time</dt>
        <dd>{format(result.timeS, 3)} s</dd>
      </div>
      <div>
        <dt>Wood in hearth</dt>
        <dd>{result.fuelUnits}</dd>
      </div>
      <div>
        <dt>Unreleased paid dose</dt>
        <dd>{format(result.remainingDoseFraction * 100, 2)}%</dd>
      </div>
      <div>
        <dt>Upper shutter</dt>
        <dd>{result.ventOpen ? "Open" : "Closed"}</dd>
      </div>
      <div>
        <dt>Heat supplied</dt>
        <dd>{format(result.emittedHeatJ, 3)} J</dd>
      </div>
      <div>
        <dt>Tracer supplied</dt>
        <dd>{format(result.emittedSmokeKg * 1e6, 3)} mg</dd>
      </div>
      <div>
        <dt>Downstairs air</dt>
        <dd>
          {format(result.downstairs.temperatureK, 5)} K ·{" "}
          {format(result.downstairs.smokeKgM3 * 1e6, 5)} mg/m³
        </dd>
      </div>
      <div>
        <dt>Upstairs air</dt>
        <dd>
          {format(result.upstairs.temperatureK, 5)} K ·{" "}
          {format(result.upstairs.smokeKgM3 * 1e6, 5)} mg/m³
        </dd>
      </div>
    </dl>
  );
}

function CheckpointControls({ busy, available, reopen, download, reset }) {
  return (
    <div className="air-checkpoint-actions">
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !available}
        onClick={reopen}
      >
        Reopen checkpoint
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!available}
        onClick={download}
      >
        Download checkpoint
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={reset}>
        New room
      </Button>
    </div>
  );
}

function BrewhouseAir() {
  const host = useRef(null);
  const view = useRef(null);
  const worker = useRef(null);
  const sequence = useRef(0);
  const checkpoint = useRef(null);
  const sceneTime = useRef(0);
  const [scene, setScene] = useState(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("Opening the brewhouse…");
  const [turn, setTurn] = useState(0);
  const [layer, setLayer] = useState("cutaway");
  const [showHeat, setShowHeat] = useState(false);
  const [showSmoke, setShowSmoke] = useState(false);

  function send(action, details = {}) {
    if (!worker.current || busy) return;
    setBusy(true);
    worker.current.postMessage({
      id: ++sequence.current,
      action,
      ...details,
    });
  }

  useEffect(() => {
    let disposed = false;
    const runtime = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker.current = runtime;
    function stop(message) {
      runtime.terminate();
      worker.current = null;
      setBusy(true);
      setNotice(
        `${message} Reload to restart; the last completed checkpoint remains downloadable.`,
      );
    }
    runtime.onmessage = ({ data }) => {
      if (disposed || data.id !== sequence.current) return;
      setBusy(false);
      if (!data.ok) {
        setNotice(explain(data.error));
        return;
      }
      checkpoint.current = data.checkpoint;
      setScene(data.scene);
      setNotice(noticeFor(data, sceneTime.current));
      sceneTime.current = data.scene.result.timeS;
    };
    runtime.onerror = (event) =>
      stop(event.message || "The room worker stopped.");
    createBrewhouseAirView(host.current)
      .then((renderer) => {
        if (disposed) {
          renderer.destroy();
          return;
        }
        view.current = renderer;
        runtime.postMessage({ id: ++sequence.current, action: "inspect" });
      })
      .catch((error) => {
        if (!disposed) stop(error.message);
      });
    return () => {
      disposed = true;
      runtime.terminate();
      view.current?.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    if (scene && view.current)
      view.current.draw(scene, turn, layer, {
        heat: showHeat,
        smoke: showSmoke,
      });
  }, [scene, turn, layer, showHeat, showSmoke]);

  function download() {
    const url = URL.createObjectURL(
      new Blob([checkpoint.current], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "brewhouse-air.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const result = scene?.result;
  return (
    <>
      <section className="air-heading">
        <div>
          <p>Live local Hive world</p>
          <h1>Warm air in the brewhouse</h1>
          <span>
            One stocked hearth, two authored storeys, and the actual bounded air
            owner. The upper shutter changes the path; it does not promise
            cleaner air.
          </span>
        </div>
        <Badge tone="neutral" size="sm">
          Browser-local checkpoint
        </Badge>
      </section>

      <div className="air-layout">
        <div className="air-world" ref={host} data-brewhouse-air-world />
        <Card variant="outline" className="air-panel">
          <CardContent>
            <p className="air-status" role="status">
              {notice}
            </p>
            <RoomControls
              busy={busy}
              result={result}
              scene={scene}
              send={send}
              turnView={() => setTurn((value) => (value + 1) % 4)}
            />
            <LayerControls scene={scene} layer={layer} select={setLayer} />
            <FieldControls
              scene={scene}
              showHeat={showHeat}
              showSmoke={showSmoke}
              toggleHeat={() => setShowHeat((value) => !value)}
              toggleSmoke={() => setShowSmoke((value) => !value)}
            />
            <RoomFacts result={result} />
            <CheckpointControls
              busy={busy}
              available={Boolean(checkpoint.current)}
              reopen={() => send("reopen", { checkpoint: checkpoint.current })}
              download={download}
              reset={() => send("reset")}
            />
          </CardContent>
        </Card>
      </div>

      <Card variant="outline" className="air-legend">
        <CardContent>
          <p>
            The optional <span className="air-key heat" /> heat and{" "}
            <span className="air-key smoke" /> tracer fields occupy the actual 1
            × 0.54 × 1 m air cells. Their eight fixed opacity steps cover 0–
            {AIR_VISUAL_SCALE.heatDeltaK} K above 293.15 K and 0–
            {AIR_VISUAL_SCALE.smokeKgM3 * 1e6} mg/m³ tracer. The scale never
            renormalizes to the current frame.
          </p>
          <p>
            The retained 66-second comparison found that opening this upper
            shutter drew about 50% more tracer past the upstairs measurement,
            with little exterior clearance. This view does not claim safe
            ventilation, chemical combustion, oxygen, actor exposure, server
            durability, or autonomous time.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

const root = document.querySelector("#brewhouse-air");
if (!root) throw new Error("Brewhouse air view requires #brewhouse-air");
createRoot(root).render(<BrewhouseAir />);
