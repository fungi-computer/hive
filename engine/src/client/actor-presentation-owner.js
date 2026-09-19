import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { createAnimationClock, figureFrame } from "./animation.js";
import { createMultipartVisualOwner, multipartOverlayZIndex } from "./multipart-visual-owner.js";
import { resolveStaticVisualParts } from "./visual-resolver.js";
import { visibleHitAreaFor } from "../../../src/visual-hit-geometry.js";
import { multipartSubjectDrawRecords, multipartSubjectPartInputs, multipartSubjectSync,
  ordinarySubjectDrawRecord, subjectDrawGeometry } from "./subject-draw-records.js";

/** Owns actor sprites, multipart siblings, animation/reaction state, and all
 * actor draw records for one client. World facts remain caller-owned. */
export function createActorPresentationOwner({ parent, project, bindings, root, effectClock }) {
  if (!parent?.addChild || typeof project !== "function" || !bindings || !root || typeof effectClock !== "function")
    throw new Error("actor presentation owner requires world parent, projection, bindings, root and clock");
  const actorCache = new Map();
  const subjectReactions = new Map();
  const animationClock = createAnimationClock();
  let disposed = false;

  function update({ subjects, selectedIds, art, terrainFrame, paused, frameSequence, cameraTurn }) {
    if (disposed) throw new Error("actor presentation owner is disposed");
    if (!Array.isArray(subjects) || !Array.isArray(selectedIds) || !Number.isSafeInteger(cameraTurn))
      throw new Error("invalid actor presentation frame");
    const animationById = new Map(
      animationClock
        .sample(subjects, {
          now: performance.now(),
          paused: paused,
          sequence: frameSequence,
        })
        .map((sample) => [sample.id, sample]),
    );
    const liveIds = new Set(subjects.map((subject) => subject.id));
    for (const [id, entry] of actorCache) {
      if (liveIds.has(id)) continue;
      entry.multipart?.dispose();
      entry.container.destroy({
        children: true,
        texture: false,
        textureSource: false,
      });
      actorCache.delete(id);
    }
    const records = [];
    const orderedSubjects = [...subjects].sort((a, b) => a.id.localeCompare(b.id));
    for (const subject of orderedSubjects) {
      subject.screen = project(subject.x, subject.y, subject.z);
      const binding = bindings[subject.visual];
      if (!binding)
        throw new Error(`no visual binding for ${subject.visual ?? "missing visual"}`);
      if (!new Set(["figure", "static"]).has(binding.kind))
        throw new Error(`invalid visual binding for ${subject.visual}`);
      const isStatic = binding?.kind === "static";
      let entry = actorCache.get(subject.id);
      if (!entry) {
        entry = {
          container: new Container(),
          sprite: new Sprite(),
          marker: new Graphics()
            .ellipse(0, 0, 18, 9)
            .stroke({ color: 0xe8c779, width: 2 }),
          label: new Text({
            style: {
              fontFamily: getComputedStyle(root).fontFamily,
              fontSize: 12,
              fill: 0xf7edcf,
            },
          }),
          progress: new Graphics(),
        };
        entry.container.eventMode = "none";
        entry.sprite.eventMode = "none";
        entry.container.addChild(entry.sprite, entry.marker, entry.label, entry.progress);
        parent.addChild(entry.container);
        actorCache.set(subject.id, entry);
      }
      const animation = animationById.get(subject.id);
      entry.marker.visible = selectedIds.includes(subject.id);
      const figure = art?.figures?.[binding.key];
      const reaction = subjectReactions.get(subject.id);
      const reactionFrames = reaction && reaction.until > effectClock()
        ? reaction.frames : null;
      if (reaction && !reactionFrames) subjectReactions.delete(subject.id);
      const physicalFacing = ((Math.round(subject.facing ?? 0) % 4) + 4) % 4;
      const viewFacing = (physicalFacing + cameraTurn) % 4;
      const staticVisual = isStatic
        ? (subject.projectile?.state === "embedded" && art.projectiles?.cannonballEmbedded
          ? { texture: art.projectiles.cannonballEmbedded, anchor: art.propAnchor }
          : resolveStaticVisualParts(art, binding, viewFacing, animation?.frame ?? 0, cameraTurn))
        : undefined;
      const texture = reactionFrames?.length
        ? reactionFrames[Math.min(reactionFrames.length - 1, Math.floor((effectClock() - reaction.started) / 45))]
        : isStatic
        ? staticVisual?.texture
        : figureFrame(figure, binding, subject, animation
          ? { ...animation, direction: ((animation.direction ?? physicalFacing) + cameraTurn) % 4 } : animation);
      if (art && !texture)
        throw new Error(`visual asset unavailable for ${subject.visual}`);
      const anchor = isStatic ? staticVisual?.anchor : art?.pawnAnchor;
      if (texture && (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)))
        throw new Error(`visual anchor unavailable for ${subject.visual}`);
      subject.hitArea = texture
        ? visibleHitAreaFor(texture, anchor)
        : undefined;
      const canSort = Boolean(terrainFrame || Number.isFinite(subject.support?.level) || Number.isFinite(subject.surface?.level));
      const geometry = texture && canSort ? subjectDrawGeometry({
        subject,
        binding,
        texture,
        anchor,
        artPlacement: art.placementByTexture?.get(texture),
        verticalMetres: terrainFrame?.verticalMetres,
        project,
        hitArea: subject.hitArea,
      }) : undefined;
      // Every static visual uses the same owner lifecycle; a one-part visual
      // simply produces one sibling record.
      const multipart = isStatic && staticVisual?.parts?.length ? staticVisual.parts : null;
      entry.multipartRecords = [];
      if (!multipart) entry.multipart?.sync({ entityId: subject.id, parts: [] });
      entry.sprite.texture = multipart ? Texture.EMPTY : texture ?? Texture.EMPTY;
      entry.sprite.visible = canSort && !multipart;
      if (multipart && canSort) {
        entry.multipart ??= createMultipartVisualOwner({ parent: parent, createSprite: () => new Sprite(), emptyTexture: Texture.EMPTY });
        const partRecords = entry.multipart.sync({
          ...multipartSubjectSync({
            subject,
            geometry,
            facing: physicalFacing,
            pickable: subject.pickable,
            hitAreaFor: partTexture => visibleHitAreaFor(partTexture, anchor),
          }),
          parts: multipartSubjectPartInputs({ parts: multipart, geometry }),
        });
        entry.multipartRecords = partRecords;
        records.push(...multipartSubjectDrawRecords(partRecords));
      } else if (multipart) entry.multipart?.sync({ entityId: subject.id, parts: [] });
      if (texture && canSort && !multipart) {
        entry.sprite.anchor.set(anchor.x, anchor.y);
        entry.sprite.scale.set(1);
        entry.sprite.position.set(...geometry.screenOffset);
        records.push(ordinarySubjectDrawRecord({
          subject,
          binding,
          geometry,
          display: entry.container,
          sprite: entry.sprite,
        }));
      }
      entry.label.text = subject.name;
      entry.label.anchor.set(0.5, 1);
      entry.label.position.set(0, -12);
      entry.label.visible = selectedIds.includes(subject.id);
      entry.progress.clear();
      const progress = subject.activity?.progress;
      if (Number.isFinite(progress)) {
        const bounded = Math.max(0, Math.min(1, progress));
        entry.progress
          .rect(-10, -25, 20, 2).fill({ color: 0x253a2d, alpha: 0.9 })
          .rect(-9, -24.5, 18 * bounded, 1).fill(0xefcb7b);
      }
      entry.progress.visible = Number.isFinite(progress);
      entry.container.position.set(subject.screen.x, subject.screen.y);
    }
    return Object.freeze(records);
  }

  function syncOverlays() {
    for (const entry of actorCache.values()) {
      if (entry.multipartRecords?.length) entry.container.zIndex = multipartOverlayZIndex(entry.multipartRecords);
    }
  }
  function resetTimeline() { subjectReactions.clear(); animationClock.reset(); }
  function clear() {
    resetTimeline();
    for (const entry of actorCache.values()) {
      entry.multipart?.dispose();
      entry.container.destroy({ children: true, texture: false, textureSource: false });
    }
    actorCache.clear();
  }
  function react(id, frames, duration) {
    if (disposed || !Array.isArray(frames)) return;
    subjectReactions.set(id, { frames, started: effectClock(), until: effectClock() + duration });
  }
  return Object.freeze({ update, syncOverlays, resetTimeline, clear, react,
    dispose() { if (!disposed) { clear(); disposed = true; } } });
}
