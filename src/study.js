import * as THREE from "three";
import { Application, Sprite, Graphics } from "pixi.js";
import { anchor, bakeArt } from "./art.js";
import { bake } from "./art/bake.js";
import { scene, box, cylinder } from "./art/geometry.js";
import { figure } from "./art/figures.js";
import "./study.css";

// One world unit projects to a 32 × 16 ground diamond. With this orthographic
// camera a vertical world unit projects to ~19.6 px. Canvas padding has no role
// in world scale. The home demo now uses this accepted camera scale.
import { camera } from "./art/scale.js";
const LINEUPS = {
  original: ["rowan", "knight", "wizard", "goblin", "cat"],
  visitors: [
    "rowan",
    "witch-crooked",
    "witch-runner",
    "child-cloth",
    "child-apprentice",
  ],
};
const LABELS = {
  rowan: ["Rowan", "Human · patched coat"],
  knight: ["Rustwatch", "Armor silhouette"],
  wizard: ["Fen wizard", "Robe & crooked hat"],
  goblin: ["Goblin", "Wiry limbs · long ears"],
  cat: ["Bramble", "Cat · no known loyalties"],
  "witch-crooked": ["Moth", "Witch · hair and crooked hat"],
  "witch-runner": ["Sedge", "Witch · practical runner"],
  "child-cloth": ["Pip", "Child · bright cuff"],
  "child-apprentice": ["Nettle", "Child · apprentice cap"],
};
const ALL_KINDS = [...new Set(Object.values(LINEUPS).flat())];
const FRAME_WIDTH = 48,
  FRAME_HEIGHT = 64;
const HOME_KINDS = ["rowan", "witch-runner"];
const HOME_POSES = [
  "idle",
  "walk",
  "chop",
  "build",
  "carry",
  "pickup",
  "deliver",
  "sleep",
];
const HOME_LABELS = { rowan: "Rowan", "witch-runner": "Sedge" };
const imageUrls = new WeakMap();
function animationFrame(length, pose, elapsed, activeFrameMs) {
  if (length === 1) return 0;
  const frameMs = pose === "idle" ? 400 : activeFrameMs;
  return Math.floor(elapsed / frameMs) % length;
}
function plinth() {
  const s = scene();
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++) {
      box(s, (x + z) % 2 ? "#756f51" : "#807658", x, -0.1, z, 0.97, 0.18, 0.97);
    }
  // Original sparse tufts; no reference tile pixels are used.
  for (let i = 0; i < 7; i++) {
    const x = Math.sin(i * 3.1) * 1.28,
      z = Math.cos(i * 2.6) * 1.27;
    cylinder(s, i % 2 ? "#858c52" : "#677642", x, 0.045, z, 0, 0.055, 0.18, 3);
  }
  return s;
}
function doorway() {
  const s = scene();
  for (const side of [-1, 1]) {
    box(s, "#695342", side * 0.58, 1.13, -0.38, 0.2, 2.26, 0.22);
    box(s, "#a48a5d", side * 0.57, 1.11, -0.245, 0.065, 2.2, 0.035);
  }
  box(s, "#816749", 0, 2.25, -0.38, 1.42, 0.18, 0.25);
  box(s, "#b09a6f", 0, 2.355, -0.38, 1.5, 0.065, 0.3);
  return s;
}
function pixels(texture) {
  return texture.source.resource;
}
function imageUrl(texture) {
  if (!imageUrls.has(texture))
    imageUrls.set(texture, pixels(texture).toDataURL("image/png"));
  return imageUrls.get(texture);
}
function bounds(canvas) {
  const data = canvas
    .getContext("2d")
    .getImageData(0, 0, canvas.width, canvas.height).data;
  const box = { left: canvas.width, top: canvas.height, right: -1, bottom: -1 };
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++)
      if (data[(y * canvas.width + x) * 4 + 3]) {
        box.left = Math.min(box.left, x);
        box.right = Math.max(box.right, x);
        box.top = Math.min(box.top, y);
        box.bottom = Math.max(box.bottom, y);
      }
  return {
    ...box,
    width: box.right - box.left + 1,
    height: box.bottom - box.top + 1,
  };
}
function homeMetrics(art) {
  return Object.fromEntries(
    HOME_KINDS.map((kind) => [
      kind,
      Object.fromEntries(
        HOME_POSES.map((pose) => [
          pose,
          art.figures[kind][pose].map((frames, direction) =>
            frames.map((texture, frame) => ({
              pose,
              direction,
              frame,
              canvasWidth: pixels(texture).width,
              canvasHeight: pixels(texture).height,
              ...bounds(pixels(texture)),
            })),
          ),
        ]),
      ),
    ]),
  );
}
async function studyArt() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const portrait = camera(FRAME_WIDTH, FRAME_HEIGHT, 1.03);
  const prop = camera(128, 128, 0.8);
  const art = {
    anchor: anchor(portrait),
    propAnchor: anchor(prop),
    figures: {},
    metrics: {},
  };
  art.plinth = bake(renderer, plinth(), prop, 128, 128);
  art.door = bake(renderer, doorway(), prop, 128, 128);
  for (const kind of ALL_KINDS) {
    art.figures[kind] = { idle: [], walk: [] };
    art.metrics[kind] = [];
    for (let direction = 0; direction < 4; direction++) {
      for (const pose of ["idle", "walk"]) {
        const frames = [];
        const count =
          pose === "walk" || (pose === "idle" && kind === "cat") ? 8 : 1;
        for (let frame = 0; frame < count; frame++) {
          const texture = bake(
            renderer,
            figure(kind, frame / count, (direction * Math.PI) / 2, pose),
            portrait,
            FRAME_WIDTH,
            FRAME_HEIGHT,
          );
          frames.push(texture);
          art.metrics[kind].push({
            pose,
            direction,
            frame,
            ...bounds(pixels(texture)),
          });
        }
        art.figures[kind][pose].push(frames);
      }
    }
    await new Promise(requestAnimationFrame);
  }
  renderer.dispose();
  return art;
}
function sprite(texture, at, origin) {
  const s = new Sprite(texture);
  s.anchor.set(origin.x, origin.y);
  s.position.set(...at);
  return s;
}
async function start() {
  const art = await studyArt();
  const homeArt = await bakeArt();
  const homeMetricsData = homeMetrics(homeArt);
  const app = new Application();
  await app.init({
    width: 640,
    height: 140,
    background: 0x23352d,
    antialias: false,
    resolution: 1,
    preference: "webgl",
  });
  document.querySelector("#loading").remove();
  document.querySelector("#stage").append(app.canvas);
  app.canvas.setAttribute(
    "aria-label",
    "Five original figures standing on tiled plinths, with a timber doorway behind Rowan and a small cat at the end.",
  );
  const figures = [],
    detailImages = {},
    captionNodes = [],
    lineupButtons = document.querySelectorAll("[data-lineup]");
  let lineup = "original";
  function currentKinds() {
    return LINEUPS[lineup];
  }
  currentKinds().forEach((kind, i) => {
    const at = [64 + 128 * i, 95];
    app.stage.addChild(sprite(art.plinth, at, art.propAnchor));
    if (!i) app.stage.addChild(sprite(art.door, at, art.propAnchor));
    const shadow = new Graphics()
      .ellipse(at[0], at[1], kind === "wizard" ? 8 : 5, 2.5)
      .fill({ color: 0x293329, alpha: 0.4 });
    app.stage.addChild(shadow);
    const actor = sprite(art.figures[kind].walk[0][0], at, art.anchor);
    figures.push(actor);
    app.stage.addChild(actor);
  });
  ALL_KINDS.forEach((kind) => {
    const card = document.createElement("div");
    card.className = "detail";
    const img = new Image();
    img.alt = `${LABELS[kind][0]}, enlarged original sprite`;
    img.width = FRAME_WIDTH;
    img.height = FRAME_HEIGHT;
    const caption = document.createElement("p");
    caption.textContent = "Enlarged · same pixels";
    card.append(img, caption);
    card.hidden = !currentKinds().includes(kind);
    document.querySelector(".details").append(card);
    detailImages[kind] = img;
    captionNodes.push({ kind, title: card });
  });
  let direction = 0,
    pose = "walk",
    playing = true,
    elapsed = 0,
    previous = "",
    displayedFrame = 0;
  function lineupFrame() {
    const kinds = currentKinds();
    const frameCount = Math.max(
      ...kinds.map((kind) => art.figures[kind][pose][direction].length),
    );
    return animationFrame(frameCount, pose, elapsed, 125);
  }
  function render() {
    const kinds = currentKinds();
    const frame = lineupFrame();
    displayedFrame = frame;
    const key = `${direction},${pose},${frame}`;
    if (key === previous) return;
    previous = key;
    kinds.forEach((kind, i) => {
      const sequence = art.figures[kind][pose][direction];
      const texture = sequence[frame % sequence.length];
      figures[i].texture = texture;
      detailImages[kind].src = imageUrl(texture);
    });
  }
  function updateLineup(next) {
    lineup = next;
    previous = "";
    const kinds = currentKinds();
    document.querySelector(".captions").replaceChildren(
      ...kinds.map((kind) => {
        const node = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = LABELS[kind][0];
        const description = document.createElement("span");
        description.textContent = LABELS[kind][1];
        node.append(name, description);
        return node;
      }),
    );
    figures.forEach((actor, i) => {
      actor.visible = i < kinds.length;
      if (actor.visible) actor.position.x = 64 + 128 * i;
    });
    document
      .querySelector(".details")
      .classList.toggle("visitors", lineup === "visitors");
    captionNodes.forEach(({ kind, title }) => {
      title.hidden = !kinds.includes(kind);
      if (kinds.includes(kind))
        detailImages[kind].alt = `${LABELS[kind][0]}, enlarged original sprite`;
    });
    lineupButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.lineup === lineup),
      ),
    );
    document
      .querySelector("#scene-content")
      .classList.toggle("visitors", lineup === "visitors");
    app.canvas.setAttribute(
      "aria-label",
      lineup === "visitors"
        ? "Visitor figures standing on tiled plinths, with Rowan at the doorway and four visitors beside him."
        : "Five original figures standing on tiled plinths, with a timber doorway behind Rowan and a small cat at the end.",
    );
    render();
  }
  lineupButtons.forEach((button) => {
    button.onclick = () => updateLineup(button.dataset.lineup);
  });
  document.querySelectorAll("[data-pose]").forEach((button) => {
    button.onclick = () => {
      pose = button.dataset.pose;
      elapsed = 0;
      document
        .querySelectorAll("[data-pose]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      render();
    };
  });
  document.querySelector("#play").onclick = (event) => {
    playing = !playing;
    event.currentTarget.textContent = playing ? "Pause" : "Play";
    event.currentTarget.setAttribute("aria-pressed", String(playing));
  };
  document.querySelector("#turn").onclick = () => {
    direction = (direction + 1) % 4;
    render();
  };
  document.querySelector("#zoom").onclick = (event) => {
    const native = document
      .querySelector("#scene-content")
      .classList.toggle("native");
    event.currentTarget.textContent = native ? "Fit view" : "Native pixels";
  };

  const homeApp = new Application();
  await homeApp.init({
    width: 360,
    height: 220,
    background: 0x1b2a24,
    antialias: false,
    resolution: 1,
    preference: "webgl",
  });
  const homeStage = document.querySelector("#home-stage");
  homeStage.replaceChildren(homeApp.canvas);
  homeApp.canvas.setAttribute(
    "aria-label",
    "Selected Home actor rendered from the current 80 by 80 game texture.",
  );
  const homeShadow = new Graphics()
    .ellipse(180, 194, 54, 8)
    .fill({ color: 0x101a16, alpha: 0.65 });
  homeApp.stage.addChild(homeShadow);
  const homeSprite = new Sprite(homeArt.figures.rowan.idle[0][0]);
  homeSprite.anchor.set(homeArt.pawnAnchor.x, homeArt.pawnAnchor.y);
  homeSprite.position.set(180, 194);
  homeApp.stage.addChild(homeSprite);
  const homeSheet = document.querySelector("#home-sheet");
  const homeStatus = document.querySelector("#home-status");
  const homeActorButtons = document.querySelectorAll("[data-home-actor]");
  const homePoseButtons = document.querySelectorAll("[data-home-pose]");
  const homeDirectionButtons = document.querySelectorAll(
    "[data-home-direction]",
  );
  const homeScaleButtons = document.querySelectorAll("[data-home-scale]");
  let homeActor = "rowan",
    homePose = "idle",
    homeDirection = 0,
    homeScale = 1,
    homePlaying = false,
    homeElapsed = 0,
    homePrevious = "",
    homeSheetPrevious = "",
    homeDisplayedFrame = 0;
  function homeSequence() {
    return homeArt.figures[homeActor][homePose][homeDirection];
  }
  function renderHomeSheet(sequence, frame) {
    const sheetKey = `${homeActor},${homePose},${homeDirection},${homeScale}`;
    if (sheetKey === homeSheetPrevious) return;
    homeSheetPrevious = sheetKey;
    homeSheet.replaceChildren(
      ...sequence.map((texture, index) => {
        const card = document.createElement("figure");
        card.className = "home-frame";
        card.dataset.homeFrame = String(index);
        const image = new Image();
        image.src = imageUrl(texture);
        image.alt = `${HOME_LABELS[homeActor]} ${homePose} phase ${index + 1}`;
        image.width = 80 * homeScale;
        image.height = 80 * homeScale;
        image.dataset.homeFrame = String(index);
        card.append(image);
        const caption = document.createElement("figcaption");
        caption.textContent = `phase ${index + 1}`;
        card.append(caption);
        return card;
      }),
    );
    homeSheet.dataset.homeCount = String(sequence.length);
    homeSheet.dataset.homeScale = String(homeScale);
    homeSheet.dataset.homeActor = homeActor;
    homeSheet.dataset.homePose = homePose;
    homeSheet.dataset.homeDirection = String(homeDirection);
    homeStatus.textContent = `${HOME_LABELS[homeActor]} · ${homePose} · facing ${
      homeDirection + 1
    } · ${sequence.length} phase${sequence.length === 1 ? "" : "s"} · ${
      homeScale === 1 ? "native 1×" : "game 2×"
    }`;
  }
  function renderHome() {
    const sequence = homeSequence();
    const frame = animationFrame(sequence.length, homePose, homeElapsed, 100);
    homeDisplayedFrame = frame;
    const key = `${homeActor},${homePose},${homeDirection},${homeScale},${frame}`;
    renderHomeSheet(sequence, frame);
    if (key === homePrevious) return;
    homePrevious = key;
    homeSprite.texture = sequence[frame];
    homeSprite.scale.set(homeScale);
    homeSheet
      .querySelectorAll(".home-frame")
      .forEach((card, index) =>
        card.classList.toggle("current", index === frame),
      );
  }
  function resetHomeView() {
    homeElapsed = 0;
    homePrevious = "";
    renderHome();
  }
  homeActorButtons.forEach((button) => {
    button.onclick = () => {
      homeActor = button.dataset.homeActor;
      homeActorButtons.forEach((b) =>
        b.setAttribute("aria-pressed", String(b === button)),
      );
      resetHomeView();
    };
  });
  homePoseButtons.forEach((button) => {
    button.onclick = () => {
      homePose = button.dataset.homePose;
      homePoseButtons.forEach((b) =>
        b.setAttribute("aria-pressed", String(b === button)),
      );
      resetHomeView();
    };
  });
  homeDirectionButtons.forEach((button) => {
    button.onclick = () => {
      homeDirection = Number(button.dataset.homeDirection);
      homeDirectionButtons.forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.homeDirection) === homeDirection),
        ),
      );
      resetHomeView();
    };
  });
  homeScaleButtons.forEach((button) => {
    button.onclick = () => {
      homeScale = Number(button.dataset.homeScale);
      homeScaleButtons.forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.homeScale) === homeScale),
        ),
      );
      homeSheetPrevious = "";
      resetHomeView();
    };
  });
  document.querySelector("#home-play").onclick = (event) => {
    homePlaying = !homePlaying;
    event.currentTarget.textContent = homePlaying ? "Pause" : "Play";
    event.currentTarget.setAttribute("aria-pressed", String(homePlaying));
  };
  homeApp.ticker.maxFPS = 30;
  homeApp.ticker.add((ticker) => {
    if (homePlaying) homeElapsed += Math.min(ticker.deltaMS, 100);
    renderHome();
  });
  renderHome();
  app.ticker.maxFPS = 30;
  app.ticker.add((ticker) => {
    if (playing) elapsed += Math.min(ticker.deltaMS, 100);
    render();
  });
  render();
  window.__STUDY = {
    ready: true,
    metrics: art.metrics,
    homeMetrics: homeMetricsData,
    homeKinds: HOME_KINDS,
    homePoses: HOME_POSES,
    pawnAnchor: homeArt.pawnAnchor,
    get state() {
      return {
        direction,
        pose,
        playing,
        lineup,
        frame: displayedFrame,
        home: {
          actor: homeActor,
          pose: homePose,
          direction: homeDirection,
          scale: homeScale,
          playing: homePlaying,
          frame: homeDisplayedFrame,
        },
      };
    },
  };
}
start().catch((error) => {
  console.error(error);
  const loading = document.querySelector("#loading");
  if (loading)
    loading.textContent = "The study could not open. Reload to try again.";
});
