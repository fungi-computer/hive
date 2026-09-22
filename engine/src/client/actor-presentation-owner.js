import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { createAnimationClock, figureFrame } from "./animation.js";
import { createMultipartVisualOwner, multipartOverlayZIndex } from "./multipart-visual-owner.js";
import { resolveStaticVisual } from "./visual-resolver.js";
import { visibleHitAreaFor } from "../../../src/visual-hit-geometry.js";
import { worldVisualVolume } from "./asset-draw-geometry.js";
import { multipartSubjectDrawRecords, multipartSubjectPartInputs, multipartSubjectSync,
  ordinarySubjectDrawRecord, subjectDrawGeometry } from "./subject-draw-records.js";

const destroyEntry = entry => {
  entry.multipart?.dispose();
  entry.container.destroy({ children: true, texture: false, textureSource: false });
};
const sameRefs = (a, b) => a.length === b.length && a.every((ref, index) => ref === b[index]);

/** Owns displayed actors and one unpublished candidate. Preparing a candidate
 * never writes a displayed Sprite, label, selection marker or animation history.
 * Subjects/art and the candidate projection stay immutable during preparation. */
export function createActorPresentationOwner({ parent, project, bindings, root, effectClock }) {
  if (!parent?.addChild || typeof project !== "function" || !bindings || !root || typeof effectClock !== "function")
    throw new Error("actor presentation owner requires world parent, projection, bindings, root and clock");
  let actorCache = new Map(), disposed = false, pending;
  const subjectReactions = new Map(), animationClock = createAnimationClock();
  let lastRecords = Object.freeze([]), lastSubjects = Object.freeze([]);

  function createEntry() {
    const entry = { container: new Container(), sprite: new Sprite(),
      marker: new Graphics().ellipse(0, 0, 18, 9).stroke({ color: 0xe8c779, width: 2 }),
      label: new Text({ style: { fontFamily: getComputedStyle(root).fontFamily, fontSize: 12, fill: 0xf7edcf } }),
      progress: new Graphics() };
    entry.container.eventMode = "none"; entry.sprite.eventMode = "none";
    entry.container.addChild(entry.sprite, entry.marker, entry.label, entry.progress);
    return entry;
  }

  function prepare({ subjects, selectedIds, art, terrainFrame, paused, frameSequence, cameraTurn, projection,
    project: projectInput }) {
    let candidateProject = projectInput ?? (projection ? (x, y, z) => projection.project({ x, y, z }) : project);
    if (disposed) throw new Error("actor presentation owner is disposed");
    if (!Array.isArray(subjects) || !Array.isArray(selectedIds) || !Number.isSafeInteger(cameraTurn) || typeof candidateProject !== "function")
      throw new Error("invalid actor presentation frame");
    pending?.cancel();
    let animation = animationClock.prepare({ now: performance.now(), paused, sequence: frameSequence });
    const now = effectClock(), selected = new Set(selectedIds);
    const orderedSubjects = [...subjects].sort((a, b) => a.id.localeCompare(b.id));
    const changes = [], created = new Set(), newMultipart = new Set(), multipartTasks = [], removals = [];
    let nextCache = new Map(), records = [], subjectSnapshots = [], oldEntries = actorCache.entries();
    let index = 0, current, status = "preparing", readyRecords, readySubjects, sameRecords = true;

    function release() {
      nextCache = records = subjectSnapshots = oldEntries = current = animation = candidateProject = undefined;
      changes.length = multipartTasks.length = removals.length = orderedSubjects.length = 0;
      created.clear(); newMultipart.clear(); selected.clear();
      subjects = selectedIds = art = terrainFrame = projection = projectInput = undefined;
    }

    function append(record) {
      if (record !== lastRecords[records.length]) sameRecords = false;
      records.push(record);
    }
    function appendActorRecord(candidate, record) {
      if (record !== candidate.entry.visual?.records[candidate.visual.records.length]) candidate.sameActorRecords = false;
      candidate.visual.records.push(record); append(record);
    }
    function startActor(source) {
      if (nextCache.has(source.id)) throw new Error(`duplicate actor ${source.id}`);
      const subject = { ...source, screen: Object.freeze(candidateProject(source.x, source.y, source.z)) };
      const binding = bindings[subject.visual];
      if (!binding) throw new Error(`no visual binding for ${subject.visual ?? "missing visual"}`);
      if (binding.kind !== "figure" && binding.kind !== "static") throw new Error(`invalid visual binding for ${subject.visual}`);
      const sampled = animation.sample(subject), isStatic = binding.kind === "static";
      let entry = actorCache.get(subject.id);
      if (!entry) { entry = createEntry(); created.add(entry); }
      const reaction = subjectReactions.get(subject.id), reactionFrames = reaction && reaction.until > now ? reaction.frames : null;
      const physicalFacing = ((Math.round(subject.facing ?? 0) % 4) + 4) % 4;
      const viewFacing = (physicalFacing + cameraTurn) % 4;
      const staticVisual = isStatic ? (subject.projectile?.state === "embedded" && art?.projectiles?.cannonballEmbedded
        ? { texture: art.projectiles.cannonballEmbedded, anchor: art.propAnchor }
        : resolveStaticVisual(art, binding, viewFacing, sampled.frame, cameraTurn)) : undefined;
      const texture = reactionFrames?.length
        ? reactionFrames[Math.min(reactionFrames.length - 1, Math.floor((now - reaction.started) / 45))]
        : isStatic ? staticVisual?.texture
        : figureFrame(art?.figures?.[binding.key], binding, subject,
          { ...sampled, direction: ((sampled.direction ?? physicalFacing) + cameraTurn) % 4 });
      if (art && !texture) throw new Error(`visual asset unavailable for ${subject.visual}`);
      const anchor = isStatic ? staticVisual?.anchor : art?.pawnAnchor;
      if (texture && (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)))
        throw new Error(`visual anchor unavailable for ${subject.visual}`);
      const canSort = Boolean(terrainFrame || Number.isFinite(subject.support?.level) || Number.isFinite(subject.surface?.level));
      const parts = isStatic && staticVisual?.parts?.length ? staticVisual.parts : null;
      const artPlacement = art?.placementByTexture?.get(texture), orderingMetadata = art?.orderingByTexture?.get(texture);
      const stamp = JSON.stringify([subject.x, subject.y, subject.z, subject.screen.x, subject.screen.y,
        physicalFacing, cameraTurn, canSort, Boolean(parts), terrainFrame?.verticalMetres, subject.placement,
        subject.support, subject.surface?.level, subject.pickable !== false, anchor?.x, anchor?.y, texture?.width, texture?.height]);
      const refs = [binding, texture, artPlacement, orderingMetadata, projection, projectInput];
      const unchanged = entry.visual?.stamp === stamp && sameRefs(refs, entry.visual.refs);
      const hitArea = unchanged ? entry.visual.hitArea : texture ? visibleHitAreaFor(texture, anchor) : undefined;
      subject.hitArea = hitArea;
      Object.freeze(subject);
      const geometry = unchanged ? entry.visual.geometry : texture && canSort ? subjectDrawGeometry({
        subject, binding, texture, anchor, artPlacement, verticalMetres: terrainFrame?.verticalMetres,
        project: candidateProject, hitArea, orderingMetadata, projection, cameraTurn }) : undefined;
      const progress = subject.activity?.progress;
      const candidate = { subject, entry, texture, geometry, canSort, parts, unchanged,
        selected: selected.has(subject.id), progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null,
        expiredReaction: reaction && !reactionFrames ? reaction : undefined,
        visual: { stamp, refs, hitArea, geometry, records: [], parts: new Map(), wrapped: new Map() }, wrapIndex: 0, sameActorRecords: true };
      if (parts && canSort) {
        candidate.multipart = entry.multipart;
        if (!candidate.multipart) {
          candidate.multipart = createMultipartVisualOwner({ parent, createSprite: () => new Sprite(), emptyTexture: Texture.EMPTY });
          newMultipart.add(candidate.multipart);
        }
        const sync = unchanged ? entry.visual.sync : multipartSubjectSync({ subject, geometry, facing: physicalFacing, pickable: subject.pickable,
          hitAreaFor: partTexture => visibleHitAreaFor(partTexture, geometry.anchor) });
        candidate.visual.sync = sync;
        const origin = { x: subject.x + geometry.offset[0], y: subject.y, z: subject.z + geometry.offset[1] };
        candidate.multipartTask = candidate.multipart.prepare({ ...sync, parts, preparePart(part) {
          const metadata = art.orderingByTexture?.get(part.texture), prior = entry.visual?.parts.get(part.id);
          const input = unchanged && prior?.source === part && prior.metadata === metadata ? prior.input : {
            ...multipartSubjectPartInputs({ parts: [part], geometry })[0],
            orderGeometry: worldVisualVolume(metadata, origin, cameraTurn), supportY: subject.y, compositePartition: subject.id,
            ...(part.role === "supporting-surface" ? { contactSurface: part.geometry.footprint.map(([x, y, z]) => sync.transform({ x, y, z })) } : {}),
          };
          candidate.visual.parts.set(part.id, { source: part, metadata, input });
          return input;
        } });
      } else {
        if (entry.multipart) candidate.multipartTask = entry.multipart.prepare({ entityId: subject.id, parts: [] });
        if (texture && canSort && !parts) {
          const record = unchanged ? entry.visual.records[0]
            : ordinarySubjectDrawRecord({ subject, binding, geometry, display: entry.container });
          appendActorRecord(candidate, record);
        }
      }
      if (candidate.multipartTask) multipartTasks.push(candidate.multipartTask);
      return candidate;
    }
    function finishActor(candidate) {
      const { entry, visual, subject } = candidate;
      visual.records = entry.visual && visual.records.length === entry.visual.records.length && candidate.sameActorRecords
        ? entry.visual.records : Object.freeze(visual.records);
      nextCache.set(subject.id, entry); changes.push(candidate); subjectSnapshots.push(subject);
    }
    function apply(candidate) {
      const { entry, subject, geometry, canSort, parts } = candidate;
      if (created.has(entry)) parent.addChild(entry.container);
      candidate.multipartTask?.publish();
      if (candidate.multipart) entry.multipart = candidate.multipart;
      entry.multipartRecords = parts && canSort ? candidate.multipartTask.records : [];
      if (!candidate.unchanged) {
        entry.sprite.texture = parts ? Texture.EMPTY : candidate.texture ?? Texture.EMPTY;
        entry.sprite.visible = canSort && !parts;
        if (geometry && !parts) {
          entry.sprite.anchor.set(geometry.anchor.x, geometry.anchor.y);
          entry.sprite.scale.set(1); entry.sprite.position.set(...geometry.screenOffset);
        }
        entry.container.position.set(subject.screen.x, subject.screen.y);
      }
      entry.visual = candidate.visual;
      entry.marker.visible = candidate.selected;
      if (entry.label.text !== subject.name) entry.label.text = subject.name;
      entry.label.anchor.set(0.5, 1); entry.label.position.set(0, -12); entry.label.visible = candidate.selected;
      if (entry.progressValue !== candidate.progress) {
        entry.progress.clear();
        if (candidate.progress !== null) entry.progress
          .rect(-10, -25, 20, 2).fill({ color: 0x253a2d, alpha: 0.9 })
          .rect(-9, -24.5, 18 * candidate.progress, 1).fill(0xefcb7b);
        entry.progress.visible = candidate.progress !== null; entry.progressValue = candidate.progress;
      }
      if (candidate.expiredReaction && subjectReactions.get(subject.id) === candidate.expiredReaction)
        subjectReactions.delete(subject.id);
    }
    const task = Object.freeze({
      get ready() { return status === "ready" || status === "published"; },
      get records() { return readyRecords; },
      get subjects() { return readySubjects; },
      // Each call starts at most maxActors actors and advances at most maxParts
      // multipart units (including old-part retirement and record decoration).
      advance({ maxActors = 1, maxParts = 1 } = {}) {
        if (!Number.isSafeInteger(maxActors) || maxActors < 1 || !Number.isSafeInteger(maxParts) || maxParts < 1)
          throw new Error("actor work budgets must be positive");
        if (status === "cancelled") throw new Error("actor frame is cancelled");
        let actorsWorked = 0, partsWorked = 0;
        try {
          while (status === "preparing") {
            if (!current && index < orderedSubjects.length) {
              if (actorsWorked >= maxActors) break;
              current = startActor(orderedSubjects[index++]); actorsWorked++;
            }
            if (current) {
              if (current.multipartTask && !current.multipartTask.ready) {
                if (partsWorked >= maxParts) break;
                current.multipartTask.advance({ maxParts: 1 }); partsWorked++; continue;
              }
              if (current.parts && current.canSort && current.wrapIndex < current.multipartTask.records.length) {
                if (partsWorked >= maxParts) break;
                const raw = current.multipartTask.records[current.wrapIndex++];
                const wrapped = current.entry.visual?.wrapped.get(raw) ?? multipartSubjectDrawRecords([raw])[0];
                current.visual.wrapped.set(raw, wrapped); appendActorRecord(current, wrapped);
                partsWorked++; continue;
              }
              finishActor(current); current = undefined; continue;
            }
            if (actorsWorked >= maxActors) break;
            const old = oldEntries.next(); actorsWorked++;
            if (!old.done) {
              if (!nextCache.has(old.value[0])) removals.push(old.value);
              continue;
            }
            readyRecords = sameRecords && records.length === lastRecords.length ? lastRecords : Object.freeze(records);
            readySubjects = Object.freeze(subjectSnapshots);
            status = "ready";
          }
        } catch (error) { task.cancel(); throw error; }
        return task.ready;
      },
      publish() {
        if (status === "published") return readyRecords;
        if (status !== "ready") throw new Error(`actor frame is ${status}`);
        for (const candidate of changes) apply(candidate);
        for (const [id, entry] of removals) { destroyEntry(entry); subjectReactions.delete(id); }
        actorCache = nextCache; lastRecords = readyRecords; lastSubjects = readySubjects; animation.publish();
        status = "published"; pending = undefined;
        release();
        return readyRecords;
      },
      cancel() {
        if (status !== "preparing" && status !== "ready") return;
        status = "cancelled"; animation.cancel();
        for (const task of multipartTasks) task.cancel();
        for (const multipart of newMultipart) multipart.dispose();
        for (const entry of created) destroyEntry(entry);
        readyRecords = readySubjects = undefined;
        release();
        if (pending === task) pending = undefined;
      },
    });
    pending = task;
    return task;
  }
  function update(input) {
    const task = prepare(input);
    while (!task.advance({ maxActors: 1024, maxParts: 1024 })) { /* synchronous reference path */ }
    return task.publish();
  }
  function syncOverlays() {
    for (const entry of actorCache.values()) if (entry.multipartRecords?.length)
      entry.container.zIndex = multipartOverlayZIndex(entry.multipartRecords);
  }
  function resetTimeline() { pending?.cancel(); subjectReactions.clear(); animationClock.reset(); }
  function clear() {
    resetTimeline();
    for (const entry of actorCache.values()) destroyEntry(entry);
    actorCache.clear(); lastRecords = Object.freeze([]); lastSubjects = Object.freeze([]);
  }
  function react(id, frames, duration) {
    if (disposed || !Array.isArray(frames)) return;
    const started = effectClock();
    subjectReactions.set(id, { frames, started, until: started + duration });
  }
  return Object.freeze({ prepare, update, syncOverlays, resetTimeline, clear, react, get subjects() { return lastSubjects; },
    dispose() { if (!disposed) { clear(); disposed = true; } } });
}
