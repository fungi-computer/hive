import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@fungi.computer/caps/components/badge";
import { Button } from "@fungi.computer/caps/components/button";
import { Card, CardContent } from "@fungi.computer/caps/components/card";
import "@fungi.computer/caps/styles.css";
import { ROOM_FUEL } from "../world-presets/brewhouse-air/fuel.ts";
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
    return "The stocked wood has already been burned.";
  if (error === "opening-unchanged")
    return "The upper shutter is already in that position.";
  return `The room could not do that: ${error}`;
}

function noticeFor(data, previousTime) {
  switch (data.action) {
    case "ignite":
      return "The hearth is lit. It will burn for six seconds as time advances.";
    case "vent":
      return `Upper shutter ${data.scene.result.ventOpen ? "opened" : "closed"}. This changes the measured path; it is not a safety claim.`;
    case "advance":
      return `Waited ${data.result.timeS - previousTime} seconds.`;
    case "reopen":
      return "Reopened the saved room.";
    case "reset":
      return "Started a new closed room with one wood unit in the hearth.";
    default:
      return "The authored brewhouse is ready. The hearth is stocked and the upper shutter is closed.";
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
        Light hearth
      </Button>
      <Button
        size="sm"
        disabled={busy || !result}
        onClick={() => send("advance", { seconds: 1 })}
      >
        Wait 1 second
      </Button>
      <Button
        size="sm"
        disabled={busy || !result}
        onClick={() => send("advance", { seconds: 6 })}
      >
        Wait 6 seconds
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
    <div className="air-field-controls" aria-label="Air overlays">
      <Button
        size="sm"
        variant={showHeat ? "primary" : "outline"}
        disabled={!scene}
        aria-pressed={showHeat}
        onClick={toggleHeat}
      >
        Heat overlay
      </Button>
      <Button
        size="sm"
        variant={showSmoke ? "primary" : "outline"}
        disabled={!scene}
        aria-pressed={showSmoke}
        onClick={toggleSmoke}
      >
        Smoke overlay
      </Button>
    </div>
  );
}

function RoomFacts({ result }) {
  if (!result) return null;
  const burning = result.fuelUnits === 0 && result.remainingDoseFraction > 0;
  const fireRemaining = burning
    ? `${format(result.remainingDoseFraction * ROOM_FUEL.durationS, 2)} s`
    : result.fuelUnits > 0
      ? "Not lit"
      : "Out";
  return (
    <dl className="air-facts" data-brewhouse-air-facts>
      <div>
        <dt>Time</dt>
        <dd>{format(result.timeS, 3)} s</dd>
      </div>
      <div>
        <dt>Wood</dt>
        <dd>{result.fuelUnits === 1 ? "1 piece" : "None"}</dd>
      </div>
      <div>
        <dt>Fire remaining</dt>
        <dd>{fireRemaining}</dd>
      </div>
      <div>
        <dt>Upper shutter</dt>
        <dd>{result.ventOpen ? "Open" : "Closed"}</dd>
      </div>
      <div>
        <dt>Downstairs</dt>
        <dd>
          {format(result.downstairs.temperatureK - 273.15, 3)} °C ·{" "}
          {format(result.downstairs.smokeKgM3 * 1e6, 4)} mg/m³ smoke
        </dd>
      </div>
      <div>
        <dt>Upstairs</dt>
        <dd>
          {format(result.upstairs.temperatureK - 273.15, 3)} °C ·{" "}
          {format(result.upstairs.smokeKgM3 * 1e6, 4)} mg/m³ smoke
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
        Reopen saved room
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!available}
        onClick={download}
      >
        Download saved room
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={reset}>
        New room
      </Button>
    </div>
  );
}

function TechnicalDetails({ result }) {
  return (
    <Card variant="outline" className="air-legend">
      <CardContent>
        <details>
          <summary>Technical details and limits</summary>
          {result && (
            <p>
              The hearth has supplied {format(result.emittedHeatJ, 3)} J of
              room-directed heat and {format(result.emittedSmokeKg * 1e6, 3)}
              mg of passive tracer.
            </p>
          )}
          <p>
            The optional <span className="air-key heat" /> heat and{" "}
            <span className="air-key smoke" /> smoke overlays occupy the actual
            1 × 0.54 × 1 m air cells. Eight fixed opacity steps cover 0–
            {AIR_VISUAL_SCALE.heatDeltaK} K above 293.15 K and 0–
            {AIR_VISUAL_SCALE.smokeKgM3 * 1e6} mg/m³ tracer. The scale never
            renormalizes to the current frame.
          </p>
          <p>
            In the retained 66-second comparison, opening the upper shutter
            increased tracer past the upstairs measurement by 50.4–50.5%, with
            almost none reaching the exterior. This is an authored room study,
            not the complete generated game-world air join. It does not
            establish safe ventilation, accuracy for stronger fires or finer
            spatial behavior, chemical combustion, oxygen, or actor exposure.
            The saved room lives only in this page unless downloaded; there is
            no server durability or autonomous time.
          </p>
        </details>
      </CardContent>
    </Card>
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
  const [notice, setNotice] = useState("Opening the authored brewhouse…");
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
        `${message} Reload to restart; the last saved room remains downloadable.`,
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
          <p>Authored two-storey room study</p>
          <h1>Warm air in the brewhouse</h1>
          <span>
            Light the stocked hearth, wait, and compare the air downstairs and
            upstairs. Opening the upper shutter changes the path; it does not
            promise cleaner air.
          </span>
        </div>
        <Badge tone="neutral" size="sm">
          Browser-local saved room
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

      <TechnicalDetails result={result} />
    </>
  );
}

const root = document.querySelector("#brewhouse-air");
if (!root) throw new Error("Brewhouse air view requires #brewhouse-air");
createRoot(root).render(<BrewhouseAir />);
