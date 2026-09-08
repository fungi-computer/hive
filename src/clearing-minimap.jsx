import React from "react";
import "./clearing-minimap.css";

function cellKey(x, z) {
  return `${x},${z}`;
}

function markersFor(facts, level) {
  const markers = new Map();
  const add = (x, z, marker) => {
    const key = cellKey(x, z);
    const current = markers.get(key) ?? [];
    markers.set(key, [...current, marker]);
  };
  for (const tree of facts.trees)
    if (tree.level === level && !tree.felled)
      add(tree.x, tree.z, { kind: "tree", label: "Oak" });
  for (const structure of facts.structures)
    for (const cell of structure.cells)
      if (cell.level === level)
        add(cell.x, cell.z, {
          kind: "structure",
          label: `${structure.finished ? "Finished" : "Ordered"} ${structure.type}`,
        });
  for (const actor of facts.actors)
    if (actor.level === level)
      add(actor.x, actor.z, {
        kind: "actor",
        label: actor.name,
        selected: facts.selectedActorIds.includes(actor.id),
      });
  return markers;
}

function inViewport(viewport, x, z) {
  return (
    x >= viewport.minX &&
    x < viewport.maxXExclusive &&
    z >= viewport.minZ &&
    z < viewport.maxZExclusive
  );
}

function markerSummary(markers) {
  if (!markers.length) return { text: "", className: "empty" };
  const actor = markers.find((marker) => marker.kind === "actor");
  if (actor)
    return {
      text: actor.label.slice(0, 1),
      className: `actor${actor.selected ? " selected" : ""}`,
    };
  const structure = markers.find((marker) => marker.kind === "structure");
  if (structure) return { text: "■", className: "structure" };
  return { text: "♣", className: "tree" };
}

/**
 * Read-only Clearing map projection. The caller owns simulation facts, logical
 * level, camera viewport, and the request callback; this component owns no
 * camera, selection, gesture, persistence, or simulation state.
 */
export function ClearingMinimap({
  facts,
  level,
  viewport,
  requestedCenter,
  onRequestCenter,
}) {
  const markers = markersFor(facts, level);
  const cells = [];
  for (let z = 0; z < facts.size; z += 1)
    for (let x = 0; x < facts.size; x += 1) {
      const at = { x, z, level };
      const entries = markers.get(cellKey(x, z)) ?? [];
      const marker = markerSummary(entries);
      const visible = inViewport(viewport, x, z);
      const requested =
        requestedCenter?.x === x &&
        requestedCenter?.z === z &&
        requestedCenter?.level === level;
      const labels = [
        `${x}, ${z} · ${level === 1 ? "Upper" : "Ground"}`,
        ...entries.map((entry) => entry.label),
        visible ? "inside camera viewport" : "outside camera viewport",
        requested ? "last center request" : null,
      ].filter(Boolean);
      cells.push(
        <button
          aria-label={labels.join(" · ")}
          className={`clearing-minimap-cell ${marker.className}${visible ? " viewport" : ""}${requested ? " requested" : ""}`}
          data-cell={`${x},${z},${level}`}
          key={`${x},${z}`}
          onClick={() => onRequestCenter({ ...at })}
          type="button"
        >
          {marker.text}
        </button>,
      );
    }
  return (
    <section
      aria-label="Clearing minimap"
      className="clearing-minimap"
      style={{ "--clearing-minimap-size": facts.size }}
    >
      <header>
        <div>
          <p className="clearing-minimap-eyebrow">Local map</p>
          <h2>
            {level === 1 ? "Upper" : "Ground"} · {facts.size}×{facts.size}
          </h2>
        </div>
        <p className="clearing-minimap-key">▣ camera · ■ structure · ♣ oak</p>
      </header>
      <p className="clearing-minimap-copy">
        Click a cell to request a camera center. This read-only projection does
        not issue world commands.
      </p>
      <div
        className="clearing-minimap-grid"
        role="grid"
        aria-label={`${level === 1 ? "Upper" : "Ground"} clearing cells`}
      >
        {cells}
      </div>
      <p
        className="clearing-minimap-status"
        data-testid="minimap-request"
        role="status"
      >
        {requestedCenter
          ? `Requested center: ${requestedCenter.x}, ${requestedCenter.z} · ${requestedCenter.level === 1 ? "Upper" : "Ground"}`
          : "No center requested."}
      </p>
    </section>
  );
}
