import assert from "node:assert/strict";
import test from "node:test";
import { createMixedRenderFixture, MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";
import { compileVoxelDrawStream, voxelDrawRecordKey } from "./voxel-draw-stream.js";

const keys = records => records.map(voxelDrawRecordKey);
const indexOf = (records, record) => records.indexOf(record);

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

test("multipart supports derive far boundary, surface, supported actors, and near boundary", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const label = `${cameraOrientation}/${objectOrientation}`;
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      const { records } = compile(fixture);
      const rails = fixture.stairs.filter(record => record.partRole === "upright-boundary");
      const surface = fixture.stairs.find(record => record.partRole === "supporting-surface");
      const actors = fixture.actors.filter(record => record.attachment.support === "fixture:stair");
      const railIndexes = rails.map(record => indexOf(records, record)).sort((a, b) => a - b);
      const surfaceIndex = indexOf(records, surface);
      const actorIndexes = actors.map(record => indexOf(records, record));
      assert(railIndexes[0] < surfaceIndex, `${label}: far boundary precedes surface`);
      assert(actorIndexes.every(index => surfaceIndex < index && index < railIndexes[1]),
        `${label}: supported actors remain inside their support boundaries`);
      const orderedActorIndexes = actorIndexes.toSorted((a, b) => a - b);
      assert(orderedActorIndexes.every((index, offset) => offset === 0 || index === orderedActorIndexes[offset - 1] + 1),
        `${label}: supported actors form one position-ordered run`);
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

    const actorOrder = cameraOrientation => {
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      const { records } = compile(fixture);
      return records.filter(record => record.attachment.kind === "supported" && record.attachment.support === "fixture:stair")
        .map(record => record.fixturePosition);
    };
    assert.deepEqual(actorOrder("north"), actorOrder("south").toReversed(), `${objectOrientation}: north/south support positions`);
    assert.deepEqual(actorOrder("east"), actorOrder("west").toReversed(), `${objectOrientation}: east/west support positions`);
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
      assert.equal(indexOf(records, orderedParts[1]), indexOf(records, orderedParts[0]) + 1);
      assert.equal(indexOf(records, orderedParts[2]), indexOf(records, orderedParts[1]) + 1);
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

      for (const cover of fixture.grass) {
        const coverIndex = indexOf(records, cover);
        for (const support of cover.attachment.supports) {
          const supportRecord = fixture.input.find(record => voxelDrawRecordKey(record) === support);
          assert(supportRecord, `${label}: real cover support exists`);
          assert(indexOf(records, supportRecord) < coverIndex, `${label}: cover follows every supporting surface`);
        }
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
