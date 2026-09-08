import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@fungi.computer/caps/components/badge";
import { Button } from "@fungi.computer/caps/components/button";
import { Slider } from "@fungi.computer/caps/components/slider";
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
import {
  RECORDED_SLICE_Z,
  displayCell,
  deriveFixedScales,
  loadRecording,
  recordedFrameFacts,
  recordedSlice,
} from "./recording.js";
import "./style.css";

const CASES = Object.freeze([
  { id: "sealed", label: "Sealed shell" },
  { id: "ports", label: "Two explicit openings" },
]);

function format(value, digits = 3) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function Cell({ entry, recording, scales }) {
  const display = displayCell(recording, entry, scales);
  if (display.solid) {
    return (
      <div
        className="gas-heat-solid"
        aria-label={`Solid recorded shell cell ${display.cell.id}`}
        title={`Solid recorded shell · ${display.cell.id}`}
      />
    );
  }
  return (
    <div
      className="gas-heat-air"
      style={{
        "--gas-heat-temperature": display.temperatureFraction,
        "--gas-heat-tracer": display.tracerFraction,
      }}
      aria-label={`${display.cell.id}: ${format(display.kelvin)} K, ${format(display.tracerMgM3, 4)} mg/m³ tracer`}
      title={`${display.cell.id}\n${format(display.kelvin)} K\n${format(display.tracerMgM3, 4)} mg/m³ tracer`}
    />
  );
}

function RecordedSlice({ recording, frameIndex, scales }) {
  const slice = recordedSlice(recording, frameIndex);
  return (
    <div
      className="gas-heat-slice"
      aria-label={`Recorded z=${RECORDED_SLICE_Z} cross-section`}
    >
      {slice.map((entry) => (
        <Cell
          entry={entry}
          key={entry.cell.id}
          recording={recording}
          scales={scales}
        />
      ))}
    </div>
  );
}

function Facts({ facts }) {
  return (
    <dl className="gas-heat-facts">
      <div>
        <dt>Recorded clock</dt>
        <dd>{facts.timeSeconds} s</dd>
      </div>
      <div>
        <dt>Temperature</dt>
        <dd>
          {format(facts.temperatureKelvin.min)}–
          {format(facts.temperatureKelvin.max)} K
        </dd>
      </div>
      <div>
        <dt>Tracer</dt>
        <dd>
          {format(facts.tracerMgM3.min, 4)}–{format(facts.tracerMgM3.max, 4)}{" "}
          mg/m³
        </dd>
      </div>
      <div>
        <dt>Saved face velocity</dt>
        <dd>
          {format(facts.faceVelocityMS.min, 4)}–
          {format(facts.faceVelocityMS.max, 4)} m/s
        </dd>
      </div>
    </dl>
  );
}

function GasHeatLab({ recordings }) {
  const [caseId, setCaseId] = useState("sealed");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const recording = recordings[caseId];
  const scales = useMemo(
    () => deriveFixedScales(Object.values(recordings)),
    [recordings],
  );
  const facts = recordedFrameFacts(recording, frameIndex, scales);
  const isFinalFrame = frameIndex === recording.frames.length - 1;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= recording.frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [playing, recording.frames.length]);

  function chooseCase(nextCaseId) {
    setCaseId(nextCaseId);
    setFrameIndex(0);
    setPlaying(false);
  }

  function step() {
    setFrameIndex((current) =>
      Math.min(current + 1, recording.frames.length - 1),
    );
  }

  function selectFrame(value) {
    const nextFrame = Math.max(
      0,
      Math.min(recording.frames.length - 1, Math.round(Number(value))),
    );
    setPlaying(false);
    setFrameIndex(nextFrame);
  }

  return (
    <section className="gas-heat-lab" aria-labelledby="gas-heat-title">
      <header className="gas-heat-heading">
        <div>
          <p>Air, heat &amp; smoke</p>
          <h1 id="gas-heat-title">Recorded tracer playback</h1>
          <span>
            Saved frames from a native Node solver experiment. These controls
            only choose a recorded sample; they do not run a solver in the
            browser.
          </span>
        </div>
        <Badge tone="neutral" size="sm">
          Recorded native Node solver · not live
        </Badge>
      </header>

      <Card variant="outline" className="gas-heat-notice">
        <CardHeader>
          <CardTitle>Two exploratory recordings</CardTitle>
          <CardDescription>
            Sealed and opening cases are separate observations, not a validated
            ventilation comparison. There is no exterior domain, combustion,
            oxygen, or production simulation here.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={caseId} onValueChange={chooseCase} className="gas-heat-tabs">
        <TabsList aria-label="Recorded gas cases">
          {CASES.map((entry) => (
            <TabsTrigger
              key={entry.id}
              value={entry.id}
              data-gas-case={entry.id}
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {CASES.map((entry) => (
          <TabsContent key={entry.id} value={entry.id}>
            <Card variant="surface" className="gas-heat-frame-card">
              <CardHeader>
                <CardTitle>{recording.label}</CardTitle>
                <CardDescription>
                  Exact recorded z={RECORDED_SLICE_Z} slice. Dark cells are the
                  saved solid mask; color is a fixed display mapping shared by
                  both recordings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecordedSlice
                  recording={recording}
                  frameIndex={frameIndex}
                  scales={scales}
                />
                <Facts facts={facts} />
                <label
                  className="gas-heat-frame-selector"
                  htmlFor="gas-heat-frame"
                >
                  <span>Saved frame</span>
                  <Slider
                    id="gas-heat-frame"
                    data-gas-frame
                    tone="info"
                    min={0}
                    max={recording.frames.length - 1}
                    step={1}
                    value={frameIndex}
                    aria-valuetext={`Saved frame ${frameIndex + 1} of ${recording.frames.length}, ${facts.timeSeconds} seconds`}
                    onChange={(event) => selectFrame(event.target.value)}
                  />
                </label>
                <div
                  className="gas-heat-controls"
                  role="group"
                  aria-label="Playback controls"
                >
                  <Button
                    data-gas-play
                    size="sm"
                    disabled={isFinalFrame && !playing}
                    onClick={() => setPlaying((current) => !current)}
                  >
                    {playing ? "Pause" : "Play saved frames"}
                  </Button>
                  <Button
                    data-gas-step
                    size="sm"
                    variant="outline"
                    disabled={isFinalFrame}
                    onClick={step}
                  >
                    Step saved frame
                  </Button>
                  <Button
                    data-gas-reset
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
                    {facts.timeSeconds} s
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <section className="gas-heat-legend" aria-label="Recorded field legend">
        <span>
          <i className="gas-heat-key heat" />
          Saved air temperature in Kelvin
        </span>
        <span>
          <i className="gas-heat-key tracer" />
          Saved passive tracer concentration
        </span>
        <span>
          <i className="gas-heat-key solid" />
          Recorded solid shell
        </span>
        <small>
          Fixed scales: {format(scales.kelvin.min)}–{format(scales.kelvin.max)}{" "}
          K, 0–{format(scales.tracerMgM3.max, 4)} mg/m³, and saved face speed up
          to ±{format(scales.faceVelocityMS.max, 4)} m/s.
        </small>
      </section>

      <Card variant="outline" className="gas-heat-provenance">
        <CardHeader>
          <CardTitle>Recording provenance and limits</CardTitle>
          <CardDescription>
            Execution: {recording.execution}. Algorithm:{" "}
            {recording.algorithmVersion}. The public recording retains{" "}
            {recording.sourcePins.length} pinned source references and its exact
            46 saved samples.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            This is playback of an isolated Node experiment, not live air,
            smoke, heat, weather, or room simulation. It does not establish
            ventilation accuracy, exterior behavior, combustion, oxygen use, or
            production capacity.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

export function GasHeatLabLoader() {
  const [state, setState] = useState({
    status: "loading",
    recordings: null,
    error: null,
  });
  useEffect(() => {
    let current = true;
    Promise.all(
      CASES.map(async ({ id }) => [id, await loadRecording(id)]),
    ).then(
      (entries) => {
        if (current)
          setState({
            status: "ready",
            recordings: Object.fromEntries(entries),
            error: null,
          });
      },
      (error) => {
        if (current) setState({ status: "error", recordings: null, error });
      },
    );
    return () => {
      current = false;
    };
  }, []);
  if (state.status === "loading")
    return <p className="gas-heat-loading">Loading recorded frames…</p>;
  if (state.status === "error") {
    return (
      <p className="gas-heat-loading">
        Could not load the recorded gas study: {String(state.error)}
      </p>
    );
  }
  return <GasHeatLab recordings={state.recordings} />;
}
