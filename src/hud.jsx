import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BUILDINGS, placementProblem, shelteredBeds } from "./construction.js";
import { commandProblem } from "./clearing.js";
import { looseWood } from "./resources.js";
import { DAY_TICKS, hour } from "./jobs.js";

const ACTIVITIES = {
  idle: "Waiting for work",
  walk: "Walking",
  chop: "Chopping oak",
  pickup: "Picking up wood",
  deliver: "Delivering wood",
  build: "Building",
  sleep: "Sleeping in the bedroll",
};

function orderModel(state, job) {
  const site = state.sites.find((s) => s.id === job.target);
  const active = state.pawn.task?.job === job.id;
  const title =
    job.kind === "chop"
      ? `Chop oak ${job.target.split("-")[1]}`
      : job.kind === "rest"
        ? job.routine
          ? "Sleep until morning"
          : "Rest in bedroll"
        : `${BUILDINGS[site.type].label} · ${site.x}, ${site.z}`;
  const detail = site
    ? ` · ${site.delivered}/${BUILDINGS[site.type].wood} wood`
    : "";
  return {
    id: job.id,
    title,
    active,
    detail:
      (active ? ACTIVITIES[state.pawn.mode] : job.reason || "Ordered") + detail,
  };
}

// Snapshot only the facts the UI displays. React never reads mutable game state
// during a deferred render and never owns a simulation or resource transition.
function hudModel(state, ui, notice, speed, zoom, keys) {
  const time = hour(state);
  const tree = state.trees.find((t) => t.id === ui.tree);
  const beds = shelteredBeds(state).length;
  return {
    ...ui,
    keys,
    at: { ...ui.at },
    context: ui.context && { ...ui.context },
    speed,
    zoom,
    paused: state.paused,
    day: 1 + Math.floor((state.tick + DAY_TICKS / 3) / DAY_TICKS),
    time: `${String(Math.floor(time)).padStart(2, "0")}:${String(Math.floor((time % 1) * 60)).padStart(2, "0")}`,
    feed: `FAKE SHIITAKE · ${state.paused ? "paused" : state.demand ? `event ${state.feed.sequence} · simulated` : "seeded event pending"}`,
    demand: state.demand && { ...state.demand },
    wood: looseWood(state),
    carry: state.pawn.carry,
    rest: Math.round(state.pawn.rest),
    activity: ACTIVITIES[state.pawn.mode],
    routine: state.routine,
    restProblem: commandProblem(state, { kind: "rest" }),
    tree: tree && {
      id: tree.id,
      felled: tree.felledAt !== null,
      work: tree.work,
    },
    chopProblem: !ui.actor
      ? "Select Rowan to give work."
      : commandProblem(state, { kind: "chop", tree: ui.tree }),
    orders: state.jobs.map((job) => orderModel(state, job)),
    home: state.rested
      ? "Home used. Rested and ready for more."
      : beds
        ? "A dry bedroll. Order rest or follow a night routine."
        : "Enclose a room, roof the bedroll, then rest.",
    notice: state.paused
      ? "Paused · the world waits."
      : ui.tool
        ? placementProblem(state, {
            ...ui.at,
            type: ui.tool,
            direction: ui.direction,
          }) || "Click or drag a straight row. Wood arrives through hauling."
        : notice || state.notice,
    tutorial: !ui.actor
      ? "Click Rowan or his portrait. He has the axe; I supervise."
      : !state.felled
        ? state.jobs.some((j) => j.kind === "build")
          ? "That blueprint needs wood. Click an oak and give Rowan a chopping order."
          : "Click an oak, then choose Chop. Rowan will walk there himself."
        : !state.sites.some((s) => s.finishedAt !== null)
          ? "Lovely wood. Open Build and place a wall. He will carry the logs over."
          : !beds
            ? "A room needs walls and a doorway. Put a bedroll inside and roof both its tiles."
            : !state.rested
              ? "A roof, a bed. Click Rowan and order a rest. You have earned it."
              : "There. A home. I suppose we can stay a little longer.",
  };
}

function Key({ model, name }) {
  const hint = model.keys[name];
  return hint?.key ? <kbd aria-hidden="true">{hint.key}</kbd> : null;
}

function Panel({ title, name, send, children, className = "" }) {
  return (
    <section className={`window ${className}`} aria-label={name || title}>
      <div className="window-heading">
        <h2>{title}</h2>
        <button
          className="close"
          aria-label={`Close ${name || title}`}
          onClick={() => send({ kind: "close" })}
        >
          ×
        </button>
      </div>
      {children}
    </section>
  );
}

function Orders({ model: m, send }) {
  return (
    <ol id="orders">
      {m.orders.length ? (
        m.orders.map((job) => (
          <li key={job.id} className={job.active ? "active-order" : ""}>
            <span>
              <strong>{job.title}</strong>
              <small>{job.detail}</small>
            </span>
            <button
              data-action="next"
              data-job={job.id}
              aria-label={`Move ${job.title} next`}
              disabled={m.paused}
              onClick={() =>
                send({
                  kind: "command",
                  command: { kind: "next", job: job.id },
                })
              }
            >
              ↑
            </button>
            <button
              data-action="cancel"
              data-job={job.id}
              aria-label={`Cancel ${job.title}`}
              disabled={m.paused}
              onClick={() =>
                send({
                  kind: "command",
                  command: { kind: "cancel", job: job.id },
                })
              }
            >
              ×
            </button>
          </li>
        ))
      ) : (
        <li className="empty-orders">
          No orders. Choose a tree or mark a blueprint.
        </li>
      )}
    </ol>
  );
}

function Character({ model: m, send, portraits }) {
  return (
    <Panel
      title="Rowan"
      name="Character"
      send={send}
      className="character-window"
    >
      <div className="character-summary">
        <img src={portraits.rowan} alt="Rowan" />
        <div>
          <p className="eyebrow">HUMAN · OUTSIDER</p>
          <strong>{m.activity}</strong>
          <small>
            {m.carry
              ? `${m.carry} wood in hand`
              : "A borrowed axe. A chance to stay alive."}
          </small>
        </div>
      </div>
      <div className="rest-meter">
        <label htmlFor="rest-meter">
          Rest <b>{m.rest}%</b>
        </label>
        <meter id="rest-meter" min="0" max="100" value={m.rest} />
      </div>
      <div className="button-row">
        <button
          id="rest"
          disabled={!!m.restProblem}
          onClick={() => send({ kind: "command", command: { kind: "rest" } })}
        >
          Rest in bedroll
        </button>
        <button onClick={() => send({ kind: "focus" })}>Find Rowan</button>
      </div>
      <label className="toggle">
        <input
          id="routine"
          type="checkbox"
          checked={m.routine}
          disabled={m.paused}
          onChange={(e) =>
            send({
              kind: "command",
              command: { kind: "routine", enabled: e.target.checked },
            })
          }
        />{" "}
        Work by day, sleep by night
      </label>
      <button
        className="text-button"
        onClick={() => send({ kind: "panel", panel: "orders" })}
      >
        Work orders <span>{m.orders.length} →</span>
      </button>
    </Panel>
  );
}

function Build({ model: m, send }) {
  return (
    <Panel
      title="Make a home"
      name="Build"
      send={send}
      className="build-window"
    >
      <div id="palette">
        {Object.entries(BUILDINGS).map(([type, recipe]) => (
          <button
            key={type}
            data-build={type}
            aria-pressed={m.tool === type}
            disabled={!m.actor || m.paused}
            onClick={() => send({ kind: "tool", tool: type })}
          >
            <span>{recipe.label}</span>
            <small>
              {recipe.wood} wood{type === "bed" ? " · 1×2" : ""}
            </small>
          </button>
        ))}
      </div>
      <p className="muted">
        Mark a tile or drag a row. A blueprint can wait for wood. Leave room for
        a doorway.
      </p>
      <div className="button-row">
        <button
          id="rotate"
          disabled={!m.tool}
          onClick={() => send({ kind: "rotate" })}
        >
          Rotate footprint ↻
          <Key model={m} name="build.rotate" />
        </button>
        <button
          id="task"
          disabled={!m.tool}
          onClick={() => send({ kind: "finish-placement" })}
        >
          Done placing
        </button>
      </div>
      <p id="home-status" className="home-status">
        {m.home}
      </p>
    </Panel>
  );
}

function Target({ model: m, send }) {
  if (!m.context || !m.tree) return null;
  return (
    <section
      className="window target-window"
      aria-label="Oak actions"
      style={{
        left: Math.max(12, Math.min(innerWidth - 244, m.context.x + 12)),
        top: Math.max(80, Math.min(innerHeight - 270, m.context.y + 12)),
      }}
    >
      <div className="window-heading">
        <h2>{m.tree.felled ? "Oak stump" : "Oak tree"}</h2>
        <button
          className="close"
          aria-label="Close oak actions"
          onClick={() => send({ kind: "close-target" })}
        >
          ×
        </button>
      </div>
      <p className="muted">
        {m.tree.felled
          ? "Six logs earned. The stump stays."
          : "6 wood · Rowan works with his axe"}
      </p>
      <button
        id="chop"
        className="primary"
        disabled={!!m.chopProblem}
        onClick={() =>
          send({ kind: "command", command: { kind: "chop", tree: m.tree.id } })
        }
      >
        Chop oak
        <Key model={m} name="tree.chop" />
      </button>
      {m.chopProblem && (
        <small className="action-reason">{m.chopProblem}</small>
      )}
    </section>
  );
}

function Menu({ model: m, send }) {
  return (
    <Panel
      title="Goblin Bed & Breakfast"
      name="Menu"
      send={send}
      className="menu-window"
    >
      <p className="muted">Stay useful. Stay off the menu.</p>
      <div className="menu-actions">
        <button onClick={() => send({ kind: "fullscreen" })}>
          Browser fullscreen
        </button>
        <button onClick={() => send({ kind: "help" })}>Bramble's advice</button>
        <a href="/study">Character study ↗</a>
        <button id="reset" onClick={() => send({ kind: "reset" })}>
          Start a fresh clearing
        </button>
      </div>
      <p className="muted">
        Drag with the middle mouse button to pan. Mouse wheel zooms. On touch,
        turn on Pan view.
      </p>
      <dl className="shortcut-list">
        {Object.entries(m.keys)
          .filter(([, hint]) => hint.key)
          .map(([name, hint]) => (
            <div key={name}>
              <dt>{hint.title}</dt>
              <dd>
                <kbd>{hint.key}</kbd>
              </dd>
            </div>
          ))}
      </dl>
    </Panel>
  );
}

function Hud({ model: m, send, portraits, restoreRemovedFocus }) {
  useLayoutEffect(restoreRemovedFocus);
  return (
    <>
      <div className="world-heading">
        <span className="place-name">Bramble clearing</span>
        <span id="day">
          Day {m.day} <b>{m.time}</b>
        </span>
      </div>
      <div className="time-controls">
        <button
          id="pause"
          aria-label={m.paused ? "Resume" : "Pause"}
          onClick={() => send({ kind: "pause" })}
        >
          {m.paused ? "▶" : "Ⅱ"}
        </button>
        <button
          id="speed"
          aria-label="Change simulation speed"
          onClick={() => send({ kind: "speed" })}
        >
          {m.speed}×
        </button>
      </div>
      <nav className="roster" aria-label="Your people">
        <button
          id="select"
          aria-label="Select Rowan"
          aria-pressed={!!m.actor}
          onClick={() => send({ kind: "select", actor: "rowan" })}
        >
          <img src={portraits.rowan} alt="" />
          <span>
            Rowan<small>{m.activity}</small>
          </span>
        </button>
      </nav>
      <aside className="story">
        <span id="feed">{m.feed}</span>
        {m.demand && (
          <p id="demand">
            <b>{m.demand.name}</b> “{m.demand.text}”
          </p>
        )}
      </aside>
      <div className="view-controls">
        <button
          aria-label="Zoom out"
          disabled={m.zoom === 1}
          onClick={() => send({ kind: "zoom", delta: -1 })}
        >
          −
        </button>
        <span>{m.zoom}×</span>
        <button
          aria-label="Zoom in"
          disabled={m.zoom === 4}
          onClick={() => send({ kind: "zoom", delta: 1 })}
        >
          +
        </button>
        <button
          aria-pressed={m.panMode}
          onClick={() => send({ kind: "pan-mode" })}
        >
          Pan view
        </button>
      </div>
      {m.panel === "character" && (
        <Character model={m} send={send} portraits={portraits} />
      )}
      {m.panel === "build" && <Build model={m} send={send} />}
      {m.panel === "orders" && (
        <Panel
          title="Work orders"
          name="Orders"
          send={send}
          className="orders-window"
        >
          <p className="muted">
            First ready order runs. Move next keeps the current activity intact.
          </p>
          <Orders model={m} send={send} />
        </Panel>
      )}
      {m.panel === "menu" && <Menu model={m} send={send} />}
      <Target model={m} send={send} />
      {m.help && (
        <aside
          className={`bramble-advice ${m.panel ? "with-panel" : ""}`}
          aria-label="Bramble's advice"
        >
          <img src={portraits.cat} alt="Bramble the cat" />
          <div>
            <strong>Bramble</strong>
            <p>{m.tutorial}</p>
          </div>
          <button
            className="close"
            aria-label="Dismiss Bramble's advice"
            onClick={() => send({ kind: "help" })}
          >
            ×
          </button>
        </aside>
      )}
      <div className="status-line">
        <span id="notice" role="status">
          {m.notice}
        </span>
        <span id="score">
          {m.wood} wood · {m.carry} carried
        </span>
      </div>
      <nav className="command-bar" aria-label="Colony controls">
        <button
          aria-pressed={m.panel === "build"}
          onClick={() => send({ kind: "panel", panel: "build" })}
        >
          Build
          <Key model={m} name="panel.build" />
        </button>
        <button
          aria-pressed={m.panel === "orders"}
          onClick={() => send({ kind: "panel", panel: "orders" })}
        >
          Orders <span>{m.orders.length}</span>
          <Key model={m} name="panel.orders" />
        </button>
        <label className="cutaway-control">
          <input
            id="cutaway"
            type="checkbox"
            checked={m.cutaway}
            onChange={(e) => send({ kind: "cutaway", value: e.target.checked })}
          />{" "}
          Cutaway
        </label>
        <button
          aria-label="Center on Rowan"
          onClick={() => send({ kind: "focus" })}
        >
          Center
          <Key model={m} name="camera.focus" />
        </button>
        <button aria-pressed={m.help} onClick={() => send({ kind: "help" })}>
          Bramble
        </button>
        <button
          aria-label="Open game menu"
          aria-pressed={m.panel === "menu"}
          onClick={() => send({ kind: "panel", panel: "menu" })}
        >
          ☰
        </button>
      </nav>
    </>
  );
}

function portrait(texture, crop) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 56;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(texture.source.resource, ...crop, 0, 0, 48, 56);
  return canvas.toDataURL();
}
export function createHud(host, art, send) {
  const root = createRoot(host);
  const portraits = {
    rowan: portrait(art.pawn.idle[0][0], [28, 16, 24, 28]),
    cat: portrait(art.cat.idle[0][0], [24, 34, 30, 35]),
  };
  return {
    render(state, ui, notice, speed, zoom, keys) {
      const focused = document.activeElement;
      const ownedFocus = host.contains(focused);
      root.render(
        <Hud
          model={hudModel(state, ui, notice, speed, zoom, keys)}
          send={send}
          portraits={portraits}
          restoreRemovedFocus={() => {
            if (
              ownedFocus &&
              !focused.isConnected &&
              document.activeElement === document.body
            )
              host.parentElement.focus({ preventScroll: true });
          }}
        />,
      );
    },
    destroy() {
      root.unmount();
    },
  };
}
