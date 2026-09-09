import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@fungi.computer/caps/components/badge";
import { Button } from "@fungi.computer/caps/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@fungi.computer/caps/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@fungi.computer/caps/components/tabs";
import { Slider } from "@fungi.computer/caps/components/slider";
import {
  DEPTHS,
  changeScale,
  depthCenterSliceEntry,
  depthSlice,
  frameFacts,
  loadRecording,
  voxelKey,
} from "./recording.js";
import "./style.css";

function format(value, digits = 4) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function SoilCell({ entry, scale, selected, onSelect }) {
  const fraction = scale === 0 ? 0 : entry.massChangeKg / scale;
  return (
    <button
      type="button"
      className="soil-water-cell"
      style={{
        "--soil-water-change": fraction,
        "--soil-water-intensity": Math.abs(fraction),
      }}
      aria-pressed={selected}
      onClick={onSelect}
      title={`${entry.cell.nodeId}\nwater change ${format(entry.massChangeKg, 6)} kg\nθ ${format(entry.theta, 6)}\nvented pore capacity ${format(entry.poreAirM3, 6)} m³`}
      aria-label={`${entry.cell.nodeId}: water change ${format(entry.massChangeKg, 6)} kilograms; theta ${format(entry.theta, 6)}; vented pore capacity ${format(entry.poreAirM3, 6)} cubic metres`}
    >
      <strong>
        {entry.cell.voxel[0]}, {entry.cell.voxel[2]}
      </strong>
      <span>{format(entry.massChangeKg, 5)} kg</span>
      <small>θ {format(entry.theta, 4)}</small>
    </button>
  );
}

function SoilWaterLab({ recording }) {
  const [depthId, setDepthId] = useState("top");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedVoxelKey, setSelectedVoxelKey] = useState("0,-1,0");
  const depth = DEPTHS.find((entry) => entry.id === depthId);
  const scale = useMemo(() => changeScale(recording), [recording]);
  const slice = depthSlice(recording, frameIndex, depth.voxelY);
  const finalFrame = recording.frames.length - 1;
  const facts = frameFacts(recording, frameIndex);
  const finalFacts = frameFacts(recording, finalFrame);
  const selectedEntry =
    slice.find((entry) => voxelKey(entry.cell.voxel) === selectedVoxelKey) ??
    depthCenterSliceEntry(recording, frameIndex, depth.voxelY);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= finalFrame) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, [finalFrame, playing]);

  function selectFrame(value) {
    setPlaying(false);
    setFrameIndex(Math.max(0, Math.min(finalFrame, Math.round(Number(value)))));
  }

  function selectDepth(nextDepthId) {
    const selectedDepth = DEPTHS.find((entry) => entry.id === nextDepthId);
    if (!selectedDepth) return;
    setDepthId(nextDepthId);
    setSelectedVoxelKey(voxelKey([0, selectedDepth.voxelY, 0]));
  }

  return (
    <section className="soil-water-lab" aria-labelledby="soil-water-title">
      <header className="soil-water-heading">
        <div>
          <p>Water Lab</p>
          <h1 id="soil-water-title">Recorded 3D soil block playback</h1>
          <span>
            Saved physical frames from a fixed nonlinear soil experiment.
            Controls choose recorded samples; they do not run a solver in the
            browser.
          </span>
        </div>
        <Badge tone="info" size="sm">
          Recorded physical playback · not live
        </Badge>
      </header>

      <Card variant="outline">
        <CardHeader>
          <CardTitle>Finite pond, modest redistribution</CardTitle>
          <CardDescription>
            The finite 1 kg pond empties in the recording. Nearly all of that
            added water remains in the top-centre cell at this horizon; this is
            not a flooded region or a digging result.
          </CardDescription>
          <CardDescription>
            <strong>
              Recorded final top-centre retained water: +
              {format(finalFacts.center.massChangeKg, 6)} kg versus the saved
              start.
            </strong>
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs
        value={depthId}
        onValueChange={selectDepth}
        className="soil-water-tabs"
      >
        <TabsList aria-label="Recorded soil depth">
          {DEPTHS.map((entry) => (
            <TabsTrigger
              key={entry.id}
              value={entry.id}
              data-soil-depth={entry.id}
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {DEPTHS.map((entry) => (
          <TabsContent key={entry.id} value={entry.id}>
            <Card variant="surface" className="soil-water-frame-card">
              <CardHeader>
                <CardTitle>{entry.label}</CardTitle>
                <CardDescription>
                  Actual voxel x/z positions. Color and labels show mass change
                  from the saved 0 s state on one fixed recording-wide scale.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="soil-water-slice"
                  aria-label={`${entry.label} water change`}
                >
                  {slice.map((cell) => (
                    <SoilCell
                      entry={cell}
                      key={cell.cell.nodeId}
                      scale={scale}
                      selected={voxelKey(cell.cell.voxel) === selectedVoxelKey}
                      onSelect={() =>
                        setSelectedVoxelKey(voxelKey(cell.cell.voxel))
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card variant="outline" className="soil-water-facts-card">
        <CardHeader>
          <CardTitle>Exact selected cell facts</CardTitle>
          <CardDescription>
            `poreAirM3` means available vented pore void capacity, not finite
            gas inventory, gas pressure, oxygen, or an atmosphere model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="soil-water-facts">
            <div>
              <dt>Recorded clock</dt>
              <dd>{facts.timeS} s</dd>
            </div>
            <div>
              <dt>Finite pond</dt>
              <dd>{format(facts.pondMassKg, 6)} kg</dd>
            </div>
            <div>
              <dt>Selected voxel</dt>
              <dd>{selectedEntry.cell.voxel.join(", ")}</dd>
            </div>
            <div>
              <dt>Water mass</dt>
              <dd>{format(selectedEntry.massKg, 6)} kg</dd>
            </div>
            <div>
              <dt>Water change</dt>
              <dd>{format(selectedEntry.massChangeKg, 6)} kg</dd>
            </div>
            <div>
              <dt>θ</dt>
              <dd>{format(selectedEntry.theta, 6)}</dd>
            </div>
            <div>
              <dt>poreAirM3</dt>
              <dd>{format(selectedEntry.poreAirM3, 6)} m³</dd>
            </div>
          </dl>
          <label
            className="soil-water-frame-selector"
            htmlFor="soil-water-frame"
          >
            <span>Saved frame</span>
            <Slider
              id="soil-water-frame"
              data-soil-frame
              tone="info"
              min={0}
              max={finalFrame}
              step={1}
              value={frameIndex}
              aria-valuetext={`Saved frame ${frameIndex + 1} of ${recording.frames.length}, ${facts.timeS} seconds`}
              onChange={(event) => selectFrame(event.target.value)}
            />
          </label>
          <div
            className="soil-water-controls"
            role="group"
            aria-label="Saved playback controls"
          >
            <Button
              data-soil-play
              size="sm"
              disabled={frameIndex === finalFrame && !playing}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? "Pause" : "Play saved frames"}
            </Button>
            <Button
              data-soil-step
              size="sm"
              variant="outline"
              disabled={frameIndex === finalFrame}
              onClick={() =>
                setFrameIndex((value) => Math.min(value + 1, finalFrame))
              }
            >
              Step saved frame
            </Button>
            <Button
              data-soil-first
              size="sm"
              variant="ghost"
              disabled={frameIndex === 0}
              onClick={() => {
                setPlaying(false);
                setFrameIndex(0);
              }}
            >
              First frame
            </Button>
            <span aria-live="polite">
              Saved frame {frameIndex + 1} of {recording.frames.length} ·{" "}
              {facts.timeS} s
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="soil-water-limits">
        This recorded physical playback does not establish live digging, open
        water, oxygen, gas transport, terrain integration, or a gameplay water
        system.
      </p>
    </section>
  );
}

export function SoilWaterLabLoader() {
  const [state, setState] = useState({
    status: "loading",
    recording: null,
    error: null,
  });
  useEffect(() => {
    let active = true;
    loadRecording().then(
      (recording) =>
        active && setState({ status: "ready", recording, error: null }),
      (error) =>
        active && setState({ status: "error", recording: null, error }),
    );
    return () => {
      active = false;
    };
  }, []);
  if (state.status === "loading")
    return <p className="soil-water-loading">Loading recorded soil frames…</p>;
  if (state.status === "error")
    return (
      <p className="soil-water-loading">
        Could not load the recorded soil study: {String(state.error)}
      </p>
    );
  return <SoilWaterLab recording={state.recording} />;
}
