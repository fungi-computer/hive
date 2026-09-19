import { createMixedRenderFixture } from "../../../src/client/mixed-render-fixture.js";
import { compileVoxelDrawStream } from "../../../src/client/voxel-draw-stream.js";
import { waterDrawRecord } from "../../../src/client/cut-terrain-layer.js";
const f = createMixedRenderFixture(),
  d = f.projection.direction;
const options = { direction: d, verticalMetres: f.verticalMetres };
const water = waterDrawRecord(
  { at: [0, 0, 0], level: 7, liquidVolumeM3: 1 },
  {
    verticalMetres: f.verticalMetres,
    projection: (x, y, z) => f.projection.project({ x, y, z }),
  },
);
const bank = {
  id: "near-bank",
  part: "top",
  renderPass: "opaque",
  attachment: { kind: "cell-face", cell: [1, 1, 1], face: "top" },
};
const w = { x: -0.1, y: 0.27, z: 0.1 },
  t = (0.81 - w.y) / -d.y,
  q = { x: w.x - t * d.x, y: w.y - t * d.y, z: w.z - t * d.z };
const actor = f.actors.find((r) => r.id === "fixture:goblin:stair-middle");
const feet = actor.attachment.feet;
const lateral = {
  ...actor,
  id: "far-outside-ramp",
  attachment: {
    ...actor.attachment,
    feet: { x: feet.x + 100 * d.z, y: feet.y, z: feet.z - 100 * d.x },
  },
};
const admitted = compileVoxelDrawStream(
  [...f.stairs, lateral],
  options,
).records;
console.log(
  JSON.stringify(
    {
      water: {
        direction: d,
        waterPoint: w,
        visibleBankTopPoint: q,
        waterPixel: f.projection.project(w),
        bankPixel: f.projection.project(q),
        pointWithinVisibleBankTop:
          q.x > 0.5 && q.x < 1.5 && q.z > 0.5 && q.z < 1.5,
        actualStream: compileVoxelDrawStream(
          [water, bank],
          options,
        ).records.map((r) => r.id),
      },
      support: {
        outsideRampFeet: lateral.attachment.feet,
        admittedByFullCompiler: admitted.includes(lateral),
        stream: admitted.map((r) => r.id + ":" + r.part),
      },
    },
    null,
    2,
  ),
);
