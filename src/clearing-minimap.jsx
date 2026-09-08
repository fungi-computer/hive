import React, { useEffect, useState } from "react";
import "./clearing-minimap.css";

function cellKey(x, z) {
  return `${x},${z}`;
}

function markersFor(facts, level) {
  const markers = new Map();
  const add = (x, z, marker) => {
    const key = cellKey(x, z);
    markers.set(key, [...(markers.get(key) ?? []), marker]);
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

function markerSummary(markers) {
  if (!markers.length) return { text: "", className: "empty" };
  const actor = markers.find((marker) => marker.kind === "actor");
  if (actor)
    return {
      text: actor.label.slice(0, 1),
      className: `actor${actor.selected ? " selected" : ""}`,
    };
  if (markers.some((marker) => marker.kind === "structure"))
    return { text: "■", className: "structure" };
  return { text: "♣", className: "tree" };
}

function clampCell(value, size) {
  return Math.max(0, Math.min(size - 1, value));
}

function pointerCell(event, size) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clampCell(
      Math.floor(((event.clientX - bounds.left) / bounds.width) * size),
      size,
    ),
    z: clampCell(
      Math.floor(((event.clientY - bounds.top) / bounds.height) * size),
      size,
    ),
  };
}

/**
 * Read-only Clearing map projection. The caller owns simulation facts, logical
 * level, and the clipped quantized camera-footprint polygon. The only output
 * is a requested center cell; this component owns no camera, selection,
 * gesture, persistence, or simulation state.
 */
export function ClearingMinimap({ facts, level, viewport, onRequestCenter }) {
  const [cursor, setCursor] = useState({
    x: Math.floor(facts.size / 2),
    z: Math.floor(facts.size / 2),
    level,
  });
  useEffect(() => setCursor((current) => ({ ...current, level })), [level]);
  const markers = markersFor(facts, level);
  const request = (cell) => onRequestCenter({ ...cell, level });
  const handleKeyDown = (event) => {
    const delta =
      event.key === "ArrowLeft"
        ? { x: -1, z: 0 }
        : event.key === "ArrowRight"
          ? { x: 1, z: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, z: -1 }
            : event.key === "ArrowDown"
              ? { x: 0, z: 1 }
              : null;
    if (delta) {
      event.preventDefault();
      setCursor((current) => ({
        x: clampCell(current.x + delta.x, facts.size),
        z: clampCell(current.z + delta.z, facts.size),
        level,
      }));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      request(cursor);
    }
  };
  const cells = [];
  for (let z = 0; z < facts.size; z += 1)
    for (let x = 0; x < facts.size; x += 1) {
      const marker = markerSummary(markers.get(cellKey(x, z)) ?? []);
      const selected = cursor.x === x && cursor.z === z;
      cells.push(
        <span
          aria-hidden="true"
          className={`clearing-minimap-cell ${marker.className}${selected ? " cursor" : ""}`}
          key={`${x},${z}`}
        >
          {marker.text}
        </span>,
      );
    }
  const polygon = viewport.points
    .map((point) => `${point.x},${point.z}`)
    .join(" ");
  return (
    <section aria-label="Clearing minimap" className="clearing-minimap">
      <header>
        <div>
          <p className="clearing-minimap-eyebrow">Local map</p>
          <h2>
            {level === 1 ? "Upper" : "Ground"} · {facts.size}×{facts.size}
          </h2>
        </div>
        <p className="clearing-minimap-key">
          ◇ Visible area · ■ structure · ♣ oak
        </p>
      </header>
      <div
        aria-label={`${level === 1 ? "Upper" : "Ground"} clearing map. Arrow keys move the cell cursor; Enter or Space requests a camera center.`}
        className="clearing-minimap-surface"
        data-clearing-minimap-control
        data-testid="clearing-minimap-control"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          const cell = pointerCell(event, facts.size);
          setCursor({ ...cell, level });
          request(cell);
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div
          aria-hidden="true"
          className="clearing-minimap-grid"
          style={{ "--clearing-minimap-size": facts.size }}
        >
          {cells}
        </div>
        <svg
          aria-hidden="true"
          className="clearing-minimap-footprint"
          preserveAspectRatio="none"
          viewBox={`0 0 ${facts.size} ${facts.size}`}
        >
          <polygon points={polygon} />
        </svg>
      </div>
    </section>
  );
}
