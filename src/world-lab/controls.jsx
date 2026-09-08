import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@fungi.computer/caps/components/badge";
import { Button } from "@fungi.computer/caps/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@fungi.computer/caps/components/card";
import "@fungi.computer/caps/styles.css";

function ControlGroup({ label, children }) {
  return (
    <div className="world-lab-control-group" role="group" aria-label={label}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ExactCell({ exact }) {
  return (
    <dl className="world-lab-exact-cell" data-world-lab-exact>
      <div>
        <dt>Cell</dt>
        <dd>
          {exact.x}, {exact.z}
        </dd>
      </div>
      <div>
        <dt>Exact terrain</dt>
        <dd>{exact.terrain}</dd>
      </div>
      <div>
        <dt>Bed level</dt>
        <dd>
          {exact.bedLevel} · {exact.bedMetres} m
        </dd>
      </div>
      <div>
        <dt>Sea datum</dt>
        <dd>{exact.seaSurfaceLevel}</dd>
      </div>
    </dl>
  );
}

export function WorldLabControls({ controller }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  return (
    <section
      className="world-lab-controls"
      data-world-lab-controls
      aria-labelledby="world-lab-title"
    >
      <header className="world-lab-heading">
        <div>
          <p>Isolated terrain study</p>
          <h1 id="world-lab-title">World Lab / deterministic terrain</h1>
          <span>
            A bounded browser generator with an authoritative 80×80 local view;
            it does not load Clearing, actors, caravan, or simulation work.
          </span>
        </div>
        <Badge tone="info" size="sm">
          Live browser generator
        </Badge>
      </header>
      <Card variant="outline" className="world-lab-control-card">
        <CardHeader>
          <CardTitle>Atlas controls</CardTitle>
          <CardDescription>
            Named locations, pan, and zoom request the existing bounded worker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ControlGroup label="Named locations">
            {state.locations.map((location) => (
              <Button
                key={location.id}
                size="sm"
                variant={location.id === state.focus.id ? "primary" : "outline"}
                data-world-lab-location={location.id}
                onClick={() => controller.jump(location.id)}
              >
                {location.label}
              </Button>
            ))}
          </ControlGroup>
          <ControlGroup label="Pan atlas">
            <Button
              size="sm"
              variant="outline"
              data-world-lab-pan="north"
              onClick={() => controller.pan(0, -0.25)}
            >
              North
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-world-lab-pan="west"
              onClick={() => controller.pan(-0.25, 0)}
            >
              West
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-world-lab-pan="east"
              onClick={() => controller.pan(0.25, 0)}
            >
              East
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-world-lab-pan="south"
              onClick={() => controller.pan(0, 0.25)}
            >
              South
            </Button>
          </ControlGroup>
          <ControlGroup label="Zoom atlas">
            <Button
              size="sm"
              variant="outline"
              disabled={!state.zoom.canIn}
              data-world-lab-zoom="in"
              onClick={() => controller.zoom("in")}
            >
              Zoom in
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!state.zoom.canOut}
              data-world-lab-zoom="out"
              onClick={() => controller.zoom("out")}
            >
              Zoom out
            </Button>
          </ControlGroup>
          <div className="world-lab-scale-status" aria-live="polite">
            <strong>Requested</strong>
            <span data-world-lab-requested>{state.requested.scale}</span>
            <strong>Displayed</strong>
            <span data-world-lab-displayed>
              {state.displayed?.scale ?? "Waiting for first overview"}
            </span>
            <small data-world-lab-lifecycle>{state.lifecycle}</small>
          </div>
        </CardContent>
      </Card>
      <Card variant="surface" className="world-lab-exact-card">
        <CardHeader>
          <CardTitle>Selected exact cell</CardTitle>
          <CardDescription>
            The one-cell sampler remains the authority; overview labels are
            footprint approximations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExactCell exact={state.exact} />
        </CardContent>
      </Card>
    </section>
  );
}

export function mountWorldLabControls(host, controller) {
  createRoot(host).render(<WorldLabControls controller={controller} />);
}
