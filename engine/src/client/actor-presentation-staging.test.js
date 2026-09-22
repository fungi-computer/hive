import assert from 'node:assert/strict';
import test from 'node:test';
import { Container, Texture, TextureSource } from 'pixi.js';
import { registerVisibleSilhouette } from '../../../src/visual-hit-geometry.js';
import { createActorPresentationOwner } from './actor-presentation-owner.js';
import { createOrderingProjection } from './ordering-projection.js';

function fixture(t) {
  const priorStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ fontFamily: 'sans-serif' });
  const texture = () => {
    const result = new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
    registerVisibleSilhouette(result, { width: 8, height: 8, rows: [0,1,2,3,4,5,6,7,8],
      spans: Array.from({ length: 16 }, (_, i) => i % 2 ? 7 : 0) });
    return result;
  };
  const a = texture(), b = texture(), parent = new Container(), projection = createOrderingProjection();
  const project = (x, y, z) => projection.project({ x, y, z });
  const volume = () => ({ kind: 'volume', min: { x: -.2, y: 0, z: -.2 }, max: { x: .2, y: .5, z: .2 } });
  const art = { props: { box: a }, propAnchor: { x: .5, y: 1 }, pawnAnchor: { x: .5, y: 1 },
    figures: { test: { idle: Array.from({length:4}, () => [a]), walk: Array.from({length:4}, () => [b]) } },
    orderingByTexture: new Map([[a, volume()], [b, volume()]]) };
  const owner = createActorPresentationOwner({ parent, project,
    bindings: { box: { kind: 'static', path: ['props','box'], facing: false, anchor: 'propAnchor' },
      figure: { kind: 'figure', key: 'test' } }, root: {}, effectClock: () => 0 });
  const subject = (id, x = 0) => Object.freeze({ id, name: id, visual: 'box', x, y: 0, z: 0, facing: 0 });
  const input = { subjects: [subject('a'), subject('b', 3)], selectedIds: [], art,
    terrainFrame: { verticalMetres: .54 }, paused: true, frameSequence: 1, cameraTurn: 0, projection };
  const part = (id, partTexture = a) => Object.freeze({ id, texture: partTexture, role: 'upright-boundary',
    geometry: { footprint: [[-.2,0,-.2],[.2,0,-.2],[.2,0,.2],[-.2,0,.2]], minY: 0, maxY: .5 } });
  const multipart = parts => { art.partsByOwner = new Map([['["props","box"]', parts]]); };
  t.after(() => { owner.dispose(); a.destroy(true); b.destroy(true); globalThis.getComputedStyle = priorStyle; });
  return { owner, parent, a, b, projection, project, art, input, subject, part, multipart };
}
function finish(task) {
  let advances = 0;
  while (!task.ready) {
    task.advance();
    assert(++advances < 1000, 'bounded preparation completes');
  }
  return task;
}
function hitPoint(record) {
  return { x: (record.screenBounds.left + record.screenBounds.right) / 2,
    y: (record.screenBounds.top + record.screenBounds.bottom) / 2 };
}

test('candidate projection, overlays, selection facts and removals publish together', t => {
  const s = fixture(t), old = s.owner.update(s.input), oldSubjects = s.owner.subjects;
  const oldPoint = hitPoint(old[0]), oldX = old[0].display.x;
  let projected = 0;
  const project = (x,y,z) => { projected++; const p = s.project(x,y,z); return { x:p.x+100, y:p.y+30 }; };
  const input = { ...s.input, project, subjects: [{...s.subject('a',1),name:'Changed',activity:{target:[1,0],progress:.5}},s.subject('c',5)], selectedIds:['a'] };
  const task = s.owner.prepare(input);
  assert.equal(projected, 0); assert.equal(task.records, undefined); assert.equal(task.subjects, undefined);
  assert.equal(task.advance(), false); assert.equal(projected, 1);
  assert.equal(old[0].display.x, oldX); assert.equal(old[0].display.children[1].visible, false);
  assert.equal(old[0].display.children[2].text, 'a'); assert.equal(old[0].display.children[3].visible, false);
  assert.equal(s.owner.subjects, oldSubjects); assert.equal(old[1].display.destroyed, false);
  finish(task);
  const candidate = task.records, candidateSubjects = task.subjects;
  assert.equal(candidate[1].display.parent, null); assert.equal(s.parent.children.length, 2);
  assert.equal(old[0].contains(oldPoint), true); assert.equal(candidate[0].contains(oldPoint), false);
  assert.equal(candidate[0].contains(hitPoint(candidate[0])), true);
  assert.equal(old[0].contains(hitPoint(candidate[0])), false);
  assert(Object.isFrozen(candidateSubjects)); assert(Object.isFrozen(candidateSubjects[0])); assert(Object.isFrozen(candidateSubjects[0].screen));
  assert.equal(input.subjects[0].screen, undefined); assert.equal(input.subjects[0].hitArea, undefined);
  assert.equal(task.publish(), candidate); assert.equal(s.owner.subjects, candidateSubjects);
  assert.equal(old[0].display, candidate[0].display); assert.notEqual(old[0].display.x, oldX);
  assert.equal(old[0].display.children[1].visible, true); assert.equal(old[0].display.children[2].text, 'Changed');
  assert.equal(old[0].display.children[3].visible, true); assert.equal(old[1].display.destroyed, true);
  assert.equal(candidate[1].display.parent, s.parent); assert.equal(s.a.destroyed, false);
  assert.equal(old[0].contains(oldPoint), true, 'old picker coordinates are immutable even after shared display moves');
  task.cancel(); assert.equal(candidate[1].display.destroyed, false, 'published resources are no longer cancellation-owned');
});

test('cancelling a ready frame destroys only its new displays and releases exposed candidates', t => {
  const s = fixture(t), old = s.owner.update(s.input), oldSubjects = s.owner.subjects;
  const task = finish(s.owner.prepare({...s.input, subjects:[s.subject('a',1),s.subject('c',5)], selectedIds:['a']}));
  const candidate = task.records, detached = candidate[1].display;
  task.cancel(); task.cancel();
  assert.equal(detached.destroyed, true); assert.equal(old[0].display.destroyed, false); assert.equal(old[1].display.destroyed, false);
  assert.equal(old[0].display.children[1].visible, false); assert.equal(s.owner.subjects, oldSubjects);
  assert.equal(task.records, undefined); assert.equal(task.subjects, undefined); assert.equal(task.ready, false);
  assert.throws(() => task.publish(), /cancelled/); assert.throws(() => task.advance(), /cancelled/);
  assert.equal(s.owner.update(s.input), old); assert.equal(s.a.destroyed, false);
});

test('replacement, timeline reset and clear cancel the one pending lifetime', t => {
  const s = fixture(t); s.owner.update(s.input);
  const first = finish(s.owner.prepare({...s.input,subjects:[s.subject('new')]})), detached = first.records[0].display;
  const second = s.owner.prepare(s.input);
  assert.equal(detached.destroyed, true); assert.equal(first.records, undefined);
  second.advance(); s.owner.resetTimeline(); assert.throws(() => second.publish(), /cancelled/);
  const third = finish(s.owner.prepare({...s.input,subjects:[s.subject('next')]})), next = third.records[0].display;
  s.owner.clear(); assert.equal(next.destroyed, true); assert.equal(s.parent.children.length, 0); assert.deepEqual(s.owner.subjects, []);
});

test('multipart candidate yields per part and cancellation preserves displayed siblings', t => {
  const s = fixture(t), old = s.owner.update({...s.input,subjects:[s.subject('a')]});
  const parts = Array.from({length:12},(_,i) => s.part(`part:${i}`, i % 2 ? s.b : s.a));
  s.multipart(parts);
  let metadataReads = 0;
  const get = s.art.orderingByTexture.get.bind(s.art.orderingByTexture);
  s.art.orderingByTexture.get = key => { metadataReads++; return get(key); };
  const task = s.owner.prepare({...s.input,subjects:[s.subject('a')]});
  task.advance({maxActors:1,maxParts:1});
  assert.equal(metadataReads, 2, 'one actor texture and only one authored part are resolved');
  assert.equal(s.parent.children.length, 1); assert.equal(old[0].display.children[0].visible, true);
  finish(task); const prepared = task.records;
  assert.equal(prepared.length, 12); assert(prepared.every(record => record.display.parent === null));
  task.cancel(); assert(prepared.every(record => record.display.destroyed));
  assert.equal(old[0].display.destroyed, false); assert.equal(old[0].display.children[0].visible, true);
  const published = s.owner.update({...s.input,subjects:[s.subject('a')]});
  assert.equal(published.length, 12); assert.equal(s.parent.children.length, 13); assert.equal(old[0].display.children[0].visible, false);
});

test('unchanged multipart records survive selection and one-part changes retain siblings', t => {
  const s = fixture(t), firstPart = s.part('first'), secondPart = s.part('second', s.b);
  s.multipart([firstPart,secondPart]); const input = {...s.input,subjects:[s.subject('a')]};
  const old = s.owner.update(input), overlay = s.parent.children[0];
  const selected = finish(s.owner.prepare({...input,selectedIds:['a']}));
  assert.equal(selected.records, old); assert.equal(overlay.children[1].visible, false);
  selected.publish(); assert.equal(overlay.children[1].visible, true);
  s.multipart([firstPart, {...secondPart, geometry:{...secondPart.geometry,maxY:1}}]);
  const task = finish(s.owner.prepare(input));
  assert.equal(task.records[0], old[0]); assert.notEqual(task.records[1], old[1]);
  assert.equal(task.records[1].display, old[1].display); task.publish();
  const changedMetadata = {...s.art.orderingByTexture.get(s.b),max:{x:.2,y:2,z:.2}};
  s.art.orderingByTexture.set(s.b,changedMetadata);
  const changed = finish(s.owner.prepare(input));
  assert.equal(changed.records[0], old[0]); assert.equal(changed.records[1].orderGeometry.max.y,2); changed.publish();
});

test('multipart motion and removal leave old hits/displays intact until publication', t => {
  const s = fixture(t); s.multipart([s.part('first'),s.part('second',s.b)]);
  const input = {...s.input,subjects:[s.subject('a')]}, old = s.owner.update(input), point = hitPoint(old[0]);
  const moved = finish(s.owner.prepare({...input,subjects:[s.subject('a',2)]}));
  assert.equal(old[0].contains(point),true); assert.equal(moved.records[0].contains(point),false);
  assert.equal(old[0].display.x,old[0].screen.x); moved.publish();
  assert.equal(old[0].contains(point),true); assert.notEqual(old[0].display.x,old[0].screen.x);
  s.art.partsByOwner.clear();
  const cancelled = finish(s.owner.prepare(input)); assert.equal(cancelled.records.length,1);
  assert(old.every(record => !record.display.destroyed)); cancelled.cancel();
  assert(old.every(record => !record.display.destroyed));
  const whole = finish(s.owner.prepare(input)); whole.publish();
  assert(old.every(record => record.display.destroyed)); assert.equal(s.parent.children.length,1);
});

test('animation cancellation cannot manufacture later motion or freeze a cancelled pose', t => {
  const s = fixture(t), figure = x => ({...s.subject('figure',x),visual:'figure'});
  const input = {...s.input,subjects:[figure(0)],paused:false};
  const old = s.owner.update(input), sprite = old[0].display.children[0];
  const moving = finish(s.owner.prepare({...input,subjects:[figure(2)]}));
  assert.equal(sprite.texture,s.a); moving.cancel();
  const stationary = s.owner.update(input); assert.equal(stationary,old); assert.equal(sprite.texture,s.a);
});

test('failed preparation is isolated and duplicate actor identities reject cleanly', t => {
  const s = fixture(t), old = s.owner.update(s.input);
  const task = s.owner.prepare({...s.input,subjects:[s.subject('a',1),{...s.subject('z'),visual:'missing'}]});
  task.advance(); assert.throws(() => finish(task), /no visual binding/);
  assert.equal(task.records,undefined); assert.equal(old[0].display.destroyed,false);
  assert.equal(s.owner.update(s.input),old);
  assert.throws(() => s.owner.update({...s.input,subjects:[s.subject('a'),s.subject('a')]}), /duplicate actor/);
  assert.equal(s.owner.update(s.input),old);
});
