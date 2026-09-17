import assert from "node:assert/strict";
import test from "node:test";
import { createMixedRenderFixture, MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";
import { compileVoxelDrawStream, voxelDrawRecordKey } from "./voxel-draw-stream.js";

const keys = records => records.map(voxelDrawRecordKey);
const indexOf = (records, record) => records.indexOf(record);
const projectedBounds = points => Object.freeze({
  left: Math.min(...points.map(point => point.x)),
  right: Math.max(...points.map(point => point.x)),
  top: Math.min(...points.map(point => point.y)),
  bottom: Math.max(...points.map(point => point.y)),
});
const overlaps = (a, b) => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
const compareTraversal = (a, b) => {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (Math.abs(difference) > 1e-7) return difference;
  }
  return 0;
};

function compile(fixture, records = fixture.input) {
  return compileVoxelDrawStream(records, {
    direction: fixture.projection.direction,
    verticalMetres: fixture.verticalMetres,
  });
}

test("voxel stream is stable under reversed input for the full camera/object matrix", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const label = `${cameraOrientation}/${objectOrientation}`;
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      const forward = compile(fixture), reversed = compile(fixture, fixture.reversedInput);
      assert.deepEqual(keys(forward.records), keys(reversed.records), label);
      assert.deepEqual(forward.trace.map(({ record, pass, insertion, slot }) => ({ record, pass, insertion, slot })),
        reversed.trace.map(({ record, pass, insertion, slot }) => ({ record, pass, insertion, slot })), label);
      assert.equal(new Set(forward.records).size, fixture.input.length, `${label}: every factual record emitted once`);
      assert.deepEqual(new Set(forward.records), new Set(fixture.input), `${label}: compiler preserves the real inputs`);
    }
  }
});

test("camera-facing traversal draws a lower near actor after overlapping higher far terrain", () => {
  const fixture = createMixedRenderFixture("north", "north");
  const { projection, verticalMetres } = fixture;
  const raisedCell = [-4, 2, -4], raisedY = (raisedCell[1] + 0.5) * verticalMetres;
  const terrainCorners = [
    { x: -4.5, y: raisedY, z: -4.5 }, { x: -4.5, y: raisedY, z: -3.5 },
    { x: -3.5, y: raisedY, z: -3.5 }, { x: -3.5, y: raisedY, z: -4.5 },
  ];
  const terrain = Object.freeze({ id: "physical:raised", part: "face", renderPass: "opaque",
    attachment: Object.freeze({ kind: "cell-face", cell: raisedCell, face: "top" }),
    screenBounds: projectedBounds(terrainCorners.map(point => projection.project(point))) });
  const feet = Object.freeze({ x: -3, y: 0.5 * verticalMetres, z: -3 });
  const screen = projection.project(feet);
  const actor = Object.freeze({ id: "physical:lower-near", part: "body", renderPass: "opaque",
    attachment: Object.freeze({ kind: "supported", support: null, feet }),
    screenBounds: Object.freeze({ left: screen.x - 8, right: screen.x + 8, top: screen.y - 32, bottom: screen.y }) });

  const terrainCenter = { x: raisedCell[0], y: raisedY, z: raisedCell[2] };
  const cameraNear = point => -(projection.direction.x * point.x + projection.direction.y * point.y + projection.direction.z * point.z);
  assert(Math.abs(projection.project(terrainCenter).x - screen.x) < 1e-7, "actual projection puts both facts on one lane");
  assert(overlaps(terrain.screenBounds, actor.screenBounds), "actual projected art rectangles overlap");
  assert(feet.y < raisedY && cameraNear(feet) > cameraNear(terrainCenter), "actor is lower but physically nearer the camera");

  const { records } = compileVoxelDrawStream([actor, terrain], { direction: projection.direction, verticalMetres });
  assert(indexOf(records, terrain) < indexOf(records, actor), "far raised terrain must paint before the near lower actor");
});

test("multipart supports derive far boundary, surface, supported actors, and near boundary", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const label = `${cameraOrientation}/${objectOrientation}`;
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      const { records, trace } = compile(fixture);
      const rails = fixture.stairs.filter(record => record.partRole === "upright-boundary");
      const surface = fixture.stairs.find(record => record.partRole === "supporting-surface");
      const actors = fixture.actors.filter(record => record.attachment.support === "fixture:stair");
      const railIndexes = rails.map(record => indexOf(records, record)).sort((a, b) => a - b);
      const surfaceIndex = indexOf(records, surface);
      const actorIndexes = actors.map(record => indexOf(records, record));
      assert(railIndexes[0] < surfaceIndex, `${label}: far boundary precedes surface`);
      assert(actorIndexes.every(index => surfaceIndex < index && index < railIndexes[1]),
        `${label}: supported actors remain inside their support boundaries`);
      const orderedRails = rails.toSorted((a, b) => indexOf(records, a) - indexOf(records, b));
      const traceOf = record => trace.find(entry => entry.record === voxelDrawRecordKey(record));
      const opening = traceOf(orderedRails[0]).insertion, closing = traceOf(orderedRails[1]).insertion;
      assert.deepEqual(traceOf(surface).insertion, opening, `${label}: surface opens with far boundary`);
      assert(compareTraversal(opening, closing) < 0, `${label}: compound spans physical traversal contacts`);
      assert(actors.every(actor => compareTraversal(opening, traceOf(actor).insertion) <= 0 &&
        compareTraversal(traceOf(actor).insertion, closing) <= 0), `${label}: actor feet remain inside support span`);
      const direction = fixture.projection.direction;
      const physicalKey = actor => {
        const point = actor.attachment.feet;
        return [-(direction.x * point.x + direction.y * point.y + direction.z * point.z),
          direction.z * point.x - direction.x * point.z, point.y, point.x, point.z];
      };
      const actualActors = records.filter(record => actors.includes(record));
      assert.deepEqual(actualActors, [...actors].sort((a, b) => compareTraversal(physicalKey(a), physicalKey(b))),
        `${label}: supported actors follow fixed-camera XYZ traversal`);
    }
  }

  // Opposite cameras must reverse which authored rail is far. This proves the
  // compiler consumes transformed geometry instead of naming left/right as a
  // precomputed front/rear answer.
  for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    const firstRail = cameraOrientation => {
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      const { records } = compile(fixture);
      return fixture.stairs.filter(record => record.partRole === "upright-boundary")
        .toSorted((a, b) => indexOf(records, a) - indexOf(records, b))[0].part;
    };
    assert.notEqual(firstRail("north"), firstRail("south"), `${objectOrientation}: north/south geometry`);
    assert.notEqual(firstRail("east"), firstRail("west"), `${objectOrientation}: east/west geometry`);

  }
});

test("an unoccupied multipart support remains one compound", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      const input = fixture.input.filter(record => record.attachment.kind !== "supported" || record.attachment.support !== "fixture:stair");
      const { records } = compile(fixture, input);
      const orderedParts = records.filter(record => record.attachment.kind === "part" && record.attachment.owner === "fixture:stair");
      assert.equal(orderedParts.length, 3);
      assert.equal(orderedParts[1].attachment.role, "supporting-surface");
      assert.equal(orderedParts[0].attachment.role, "upright-boundary");
      assert.equal(orderedParts[2].attachment.role, "upright-boundary");
    }
  }
});

test("complete footprints, terrain faces, cover supports, guides, and water obey shared slots and passes", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const label = `${cameraOrientation}/${objectOrientation}`;
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      const result = compile(fixture), { records, trace } = result;
      assert.deepEqual(records, [...result.opaque, ...result.transparent], `${label}: explicit pass partitions form final stream`);
      const bedTrace = trace.find(entry => entry.record === voxelDrawRecordKey(fixture.bed));
      assert.deepEqual(new Set(bedTrace.sourcePoints), new Set(fixture.bed.attachment.points),
        `${label}: bed insertion retains both contact cells`);
      assert.deepEqual(new Set(bedTrace.crossedContacts), new Set(fixture.bed.attachment.points),
        `${label}: traversal crosses both bed contacts before emission`);
      const bedCompletion = bedTrace.crossedContacts
        .map(point => -(fixture.projection.direction.x * point.x + fixture.projection.direction.y * point.y + fixture.projection.direction.z * point.z));
      assert(Math.abs(bedTrace.insertion[0] - Math.max(...bedCompletion)) < 1e-7,
        `${label}: bed emits at footprint completion`);

      for (const cover of fixture.grass) {
        const coverIndex = indexOf(records, cover);
        for (const support of cover.attachment.supports) {
          const supportRecord = fixture.input.find(record => voxelDrawRecordKey(record) === support);
          assert(supportRecord, `${label}: real cover support exists`);
          assert(indexOf(records, supportRecord) < coverIndex, `${label}: every cover support is ready before its patch`);
        }
        const coverTrace = trace.find(entry => entry.record === voxelDrawRecordKey(cover));
        assert.deepEqual(coverTrace.sourcePoints, [cover.attachment.point], `${label}: cover keeps its declared root point`);
        assert.deepEqual(coverTrace.crossedContacts, [cover.attachment.point], `${label}: supports do not replace cover insertion`);
        assert.deepEqual(coverTrace.supportRefs, cover.attachment.supports, `${label}: support ownership remains factual`);
        const rootNear = -(fixture.projection.direction.x * cover.attachment.point.x +
          fixture.projection.direction.y * cover.attachment.point.y + fixture.projection.direction.z * cover.attachment.point.z);
        assert(Math.abs(coverTrace.anchor[0] - rootNear) < 1e-7, `${label}: readiness does not replace physical root anchor`);
      }

      const terrainByCell = new Map();
      for (const record of fixture.terrain) {
        const id = record.cell.join(","), values = terrainByCell.get(id) ?? [];
        values.push(record); terrainByCell.set(id, values);
      }
      for (const values of terrainByCell.values()) {
        const top = values.find(record => record.face === "top");
        if (!top) continue;
        for (const side of values.filter(record => !["top", "bottom"].includes(record.face)))
          assert(indexOf(records, top) < indexOf(records, side), `${label}: supporting top precedes near cliff face`);
      }

      for (const guide of fixture.guide.tiles) {
        const entry = trace.find(candidate => candidate.record === voxelDrawRecordKey(guide));
        assert.equal(entry.slot, "surface-mark", `${label}: guide uses the selected physical surface slot`);
      }
      const firstTransparent = records.findIndex(record => record.renderPass === "transparent");
      assert(firstTransparent >= 0, `${label}: transparent water present`);
      assert(records.slice(0, firstTransparent).every(record => record.renderPass === "opaque"), `${label}: opaque stream first`);
      assert(records.slice(firstTransparent).every(record => record.renderPass === "transparent"), `${label}: water pass appended`);
    }
  }
});

test("multipart support fails at the missing factual contract instead of guessing", () => {
  const fixture = createMixedRenderFixture();
  const missingBoundary = fixture.input.filter(record => record !== fixture.stairs.find(candidate => candidate.part === "rail.right"));
  assert.throws(() => compile(fixture, missingBoundary),
    /requires one supporting surface and two upright boundaries/);
});

test("multipart support rejects a render-pass split", () => {
  const fixture = createMixedRenderFixture();
  const surface = fixture.stairs.find(record => record.part === "surface");
  const changed = Object.freeze({ ...surface, renderPass: "transparent" });
  const input = fixture.input.map(record => record === surface ? changed : record);
  assert.throws(() => compile(fixture, input), /cannot cross render passes/);
});

test("screen rectangles and legacy sorter hints cannot affect voxel order", () => {
  const fixture = createMixedRenderFixture("west", "east");
  const expected = keys(compile(fixture).records);
  const poisoned = fixture.input.map(record => Object.freeze({
    ...record,
    screenBounds: Object.freeze({ left: NaN, right: NaN, top: NaN, bottom: NaN }),
    role: "ignored",
    relationPolicy: "ignored",
    orderingKind: "ignored",
    storeyBand: 999999,
    footprint: Object.freeze([]),
  }));
  assert.deepEqual(keys(compile(fixture, poisoned).records), expected);
});
