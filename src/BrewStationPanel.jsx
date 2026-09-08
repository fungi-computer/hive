import React from "react";
import { Button } from "@fungi.computer/caps/components/button";
import { Card } from "@fungi.computer/caps/components/card";
import {
  brewStartAvailable,
  clearSpentGrainStartAvailable,
  tapStartAvailable,
} from "./brew-station-presentation.js";

function jobLabel(job, action) {
  if (!job) return action;
  return job.active ? `${action} in progress` : `${action} queued`;
}

export function BrewStationPanel({ station, context, deconstructJob, send }) {
  const fillLabel = jobLabel(station.fillJob, "Fill kettle");
  const brewLabel = jobLabel(station.brewJob, "Brew herbal ale");
  const tapLabel = jobLabel(station.tapJob, "Serve herbal ale");
  const clearLabel = jobLabel(station.clearJob, "Clear spent grain");
  const deconstructLabel = jobLabel(deconstructJob, "Deconstruct");
  const processLabel = station.process
    ? `${station.process.phase.toUpperCase()} · progress ${station.process.progress}`
    : station.settled
      ? "SETTLED · keg and tray hold the completed batch facts"
      : "No active batch.";
  const canBrew = brewStartAvailable(station);
  const canTap = tapStartAvailable(station);
  const canClear = clearSpentGrainStartAvailable(station);
  return (
    <Card
      variant="outline"
      role="region"
      className="window target-window brew-station-window"
      aria-label="Brew station actions"
      style={context}
    >
      <div className="window-heading">
        <h2>Brew station · Ground</h2>
        <Button
          className="close"
          variant="ghost"
          size="icon"
          aria-label="Close brew station actions"
          onClick={() => send({ kind: "close-target" })}
        >
          ×
        </Button>
      </div>
      <p className="muted">
        Finished structure · {station.x}, {station.z} · Ground
      </p>
      <dl className="brew-station-facts">
        <div>
          <dt>Kettle</dt>
          <dd>
            Water {station.slots.kettle.water}/2 · Malt{" "}
            {station.slots.kettle.malt}
            {" · "}Mugwort {station.slots.kettle.mugwort}
          </dd>
        </div>
        <div>
          <dt>Staged requirements</dt>
          <dd>
            Fuel {station.slots.hearth.wood} · Barm {station.slots.barm.barm}
            {" · "}Keg {station.slots.keg.keg}
          </dd>
        </div>
        <div>
          <dt>Batch</dt>
          <dd>{processLabel}</dd>
        </div>
        <div>
          <dt>Settled contents</dt>
          <dd>
            Ale {station.slots.keg.ale} · Served {station.served}/
            {station.servingTotal} · Spent grain {station.slots.tray.spentGrain}
          </dd>
        </div>
      </dl>
      <small className="action-reason" data-status="brew">
        {station.brewJob?.reason ??
          (station.process
            ? station.attending
              ? "A home member is attending PREPARE."
              : "The current process is unattended."
            : station.settled
              ? station.tapReady
                ? "Live ale is available for the shared serving order."
                : "Spent grain still occupies the tray; no live ale remains to serve."
              : "Brew admission remains the authoritative recipe check.")}
      </small>
      <small className="action-reason" data-status="tap">
        {station.tapJob
          ? `${station.tapJob.reason} · progress ${station.tapJob.progress}`
          : station.tapReady
            ? "A served portion is consumed; personal inventory and needs do not exist yet."
            : "No live ale is available to serve."}
      </small>
      <small className="action-reason" data-status="clear-spent-grain">
        {station.clearJob
          ? `${station.clearJob.reason} · progress ${station.clearJob.progress}`
          : station.clearReady
            ? "Clear the canonical tray before starting the next batch."
            : "No spent grain is waiting in the tray."}
      </small>
      <div className="button-column">
        <Button
          id="fill-kettle"
          data-action="fill-kettle"
          data-site={station.id}
          variant="primary"
          disabled={!!station.fillJob || station.water >= 2}
          aria-label={fillLabel}
          onClick={() =>
            send({
              kind: "command",
              command: {
                kind: "fill-kettle",
                station: station.id,
                actors: null,
              },
            })
          }
        >
          {fillLabel}
        </Button>
        <Button
          id="brew"
          data-action="brew"
          data-site={station.id}
          variant="primary"
          disabled={!canBrew}
          aria-label={brewLabel}
          onClick={() =>
            send({
              kind: "command",
              command: { kind: "brew", station: station.id, actors: null },
            })
          }
        >
          {brewLabel}
        </Button>
        <Button
          id="tap"
          data-action="tap"
          data-site={station.id}
          variant="primary"
          disabled={!canTap}
          aria-label={tapLabel}
          onClick={() =>
            send({
              kind: "command",
              command: { kind: "tap", station: station.id, actors: null },
            })
          }
        >
          {tapLabel}
        </Button>
        <Button
          id="clear-spent-grain"
          data-action="clear-spent-grain"
          data-site={station.id}
          variant="primary"
          disabled={!canClear}
          aria-label={clearLabel}
          onClick={() =>
            send({
              kind: "command",
              command: {
                kind: "clear-spent-grain",
                station: station.id,
                actors: null,
              },
            })
          }
        >
          {clearLabel}
        </Button>
        <Button
          id="deconstruct"
          data-action="deconstruct"
          data-site={station.id}
          variant="primary"
          disabled={!!deconstructJob}
          aria-label={`${deconstructLabel} Brew station`}
          onClick={() =>
            send({
              kind: "command",
              command: { kind: "deconstruct", site: station.id },
            })
          }
        >
          {deconstructLabel}
        </Button>
      </div>
    </Card>
  );
}
