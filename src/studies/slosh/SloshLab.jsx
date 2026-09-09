import React, { useEffect, useState } from "react";
import { Badge } from "@fungi.computer/caps/components/badge";
import { Button } from "@fungi.computer/caps/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@fungi.computer/caps/components/card";
import { Slider } from "@fungi.computer/caps/components/slider";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@fungi.computer/caps/components/tabs";
import {
  SLOSH_TIERS,
  frameFacts,
  loadRecording,
  surfacePoints,
} from "./recording.js";
import "./style.css";

function format(value, digits = 4) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function Surface({ recording, tierId, frameIndex }) {
  const points = surfacePoints(recording, tierId, frameIndex);
  const baselineY = 150;
  const pixelsPerMetre = 180;
  const path = points
    .map(
      ({ xM, heightM }, index) =>
        `${index === 0 ? "M" : "L"} ${xM * 1000} ${baselineY - (heightM - recording.reference.waterDepthM) * recording.reference.visualVerticalExaggeration * pixelsPerMetre}`,
    )
    .join(" ");
  return (
    <svg
      className="slosh-surface"
      viewBox="0 0 1000 300"
      role="img"
      aria-label="Recorded 2D water surface; vertical deviations are visually exaggerated"
      data-slosh-surface
    >
      <line
        className="slosh-baseline"
        x1="0"
        x2="1000"
        y1={baselineY}
        y2={baselineY}
      />
      <path className="slosh-water" d={`${path} L 1000 300 L 0 300 Z`} />
      <path className="slosh-surface-line" d={path} />
    </svg>
  );
}

function SloshLab({ recording }) {
  const [tierId, setTierId] = useState("coarse");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { tier, sample, isFinalSavedSurface } = frameFacts(
    recording,
    tierId,
    frameIndex,
  );
  const finalFrame = tier.samples.length - 1;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(
      () =>
        setFrameIndex((current) => {
          if (current >= finalFrame) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      150,
    );
    return () => window.clearInterval(timer);
  }, [finalFrame, playing]);

  function chooseTier(nextTierId) {
    setTierId(nextTierId);
    setFrameIndex(0);
    setPlaying(false);
  }
  function selectFrame(value) {
    setPlaying(false);
    setFrameIndex(Math.max(0, Math.min(finalFrame, Math.round(Number(value)))));
  }

  return (
    <section className="slosh-lab" aria-labelledby="slosh-title">
      <header className="slosh-heading">
        <div>
          <p>Water motion</p>
          <h1 id="slosh-title">Recorded 2D slosh reference</h1>
          <span>
            Saved column-height samples from a native run that completed one
            standing-wave period. Controls select recorded samples; they do not
            run physics in the browser.
          </span>
        </div>
        <Badge tone="info" size="sm">
          Recorded native reference · not live
        </Badge>
      </header>

      <Card variant="outline">
        <CardHeader>
          <CardTitle>
            Completed native period; saved surfaces are staggered
          </CardTitle>
          <CardDescription>
            The native run completed one period, while its last saved fraction
            surface remains half the final step behind terminal time. The
            recorded amplitude is 2 mm. Surface deviations are drawn at ×
            {recording.reference.visualVerticalExaggeration} vertical
            exaggeration so the actual 2D movement remains inspectable; the
            display is not physical scale.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={tierId} onValueChange={chooseTier} className="slosh-tabs">
        <TabsList aria-label="Recorded slosh grid">
          {SLOSH_TIERS.map((entry) => (
            <TabsTrigger
              key={entry.id}
              value={entry.id}
              data-slosh-tier={entry.id}
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SLOSH_TIERS.map((entry) => (
          <TabsContent key={entry.id} value={entry.id}>
            <Card variant="surface" className="slosh-frame-card">
              <CardHeader>
                <CardTitle>{entry.label}</CardTitle>
                <CardDescription>
                  Exact recorded column heights across the 1 m closed 2D basin;
                  no velocity arrows, full field, or live fluid state is
                  present.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Surface
                  recording={recording}
                  tierId={tierId}
                  frameIndex={frameIndex}
                />
                <dl className="slosh-facts">
                  <div>
                    <dt>Saved surface time</dt>
                    <dd>{format(sample.nominalFractionTimeSeconds, 9)} s</dd>
                  </div>
                  <div>
                    <dt>Velocity-time stamp</dt>
                    <dd>{format(sample.velocityTimeSeconds, 9)} s</dd>
                  </div>
                  <div>
                    <dt>Completed terminal period</dt>
                    <dd>{format(tier.completedSeconds, 9)} s</dd>
                  </div>
                  <div>
                    <dt>Recorded columns</dt>
                    <dd>{tier.columns}</dd>
                  </div>
                  <div>
                    <dt>Native capture wall</dt>
                    <dd>{format(tier.nativeWallSeconds, 6)} s</dd>
                  </div>
                </dl>
                {isFinalSavedSurface && (
                  <p className="slosh-staggering">
                    Final saved surface is nominal-fraction time; it remains
                    half the final step behind the completed terminal period.
                  </p>
                )}
                <label className="slosh-frame-selector" htmlFor="slosh-frame">
                  <span>Exact saved sample</span>
                  <Slider
                    id="slosh-frame"
                    data-slosh-frame
                    tone="info"
                    min={0}
                    max={finalFrame}
                    step={1}
                    value={frameIndex}
                    aria-valuetext={`Saved sample ${frameIndex + 1} of ${tier.samples.length}, surface time ${sample.nominalFractionTimeSeconds} seconds`}
                    onChange={(event) => selectFrame(event.target.value)}
                  />
                </label>
                <div
                  className="slosh-controls"
                  role="group"
                  aria-label="Saved slosh playback controls"
                >
                  <Button
                    size="sm"
                    disabled={frameIndex === finalFrame && !playing}
                    onClick={() => setPlaying((value) => !value)}
                  >
                    {playing ? "Pause" : "Play saved samples"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={frameIndex === finalFrame}
                    onClick={() =>
                      setFrameIndex((current) =>
                        Math.min(current + 1, finalFrame),
                      )
                    }
                  >
                    Step sample
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={frameIndex === 0}
                    onClick={() => {
                      setPlaying(false);
                      setFrameIndex(0);
                    }}
                  >
                    First sample
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card variant="outline">
        <CardHeader>
          <CardTitle>Recorded refinement and diagnostic limits</CardTitle>
          <CardDescription>
            Fine/coarse mode RMS:{" "}
            {recording.reference.refinement.fineModeRmsPercent}% /{" "}
            {recording.reference.refinement.coarseModeRmsPercent}% (ratio{" "}
            {recording.reference.refinement.fineToCoarseRmsRatio}). The
            preserved old coarse absolute stock diagnostic remains failed at
            step {recording.reference.legacyDiagnostic.coarseFirstFailureStep};
            the newer transport budget is a separate recorded criterion.
          </CardDescription>
        </CardHeader>
      </Card>
      <p className="slosh-limits">
        This is a recorded 2D reference, not a live solver, gameplay vessel,
        velocity field, full fluid field, 3D water claim, restart proof, or
        game-performance measurement.
      </p>
    </section>
  );
}

export function SloshLabLoader() {
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
    return <p className="slosh-loading">Loading recorded slosh samples…</p>;
  if (state.status === "error")
    return (
      <p className="slosh-loading">
        Could not load the recorded slosh study: {String(state.error)}
      </p>
    );
  return <SloshLab recording={state.recording} />;
}
