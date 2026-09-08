import test from "node:test";
import assert from "node:assert/strict";
import { createClearing } from "./clearing.ts";
import {
  decideReplaceRevision,
  decideSaveRevision,
  restoreSnapshot,
  snapshotFor,
} from "./persistence.ts";

const cell = (x = 5, z = 5, level = 0) => ({ x, z, level });
const scope = { party: "home", actors: null };
function envelope(change) {
  const saved = snapshotFor(createClearing());
  change(saved.savedState);
  return saved;
}
function rejects(name, change, pattern) {
  test(name, () => {
    assert.throws(() => restoreSnapshot(envelope(change)), pattern);
  });
}
function site(id, type = "wall", overrides = {}) {
  return {
    id,
    type,
    ...cell(),
    direction: 0,
    work: 0,
    finishedAt: null,
    ...overrides,
  };
}
function job(id, kind = "chop", target = "oak-1", overrides = {}) {
  return {
    id,
    kind,
    target,
    scope,
    reason: "Ordered",
    routine: false,
    ...overrides,
  };
}
function transfer(id, overrides = {}) {
  return {
    id,
    actor: "rowan",
    owner: { job: "job-build", step: "construction-materials" },
    request: {
      source: { kind: "eligible-ground", material: "wood" },
      quantityPolicy: "portion",
      quantity: 1,
      destination: "construction-buffer:site-a",
    },
    phase: { kind: "reserved", sourceLot: "wood-a", quantity: 1 },
    ...overrides,
  };
}
function buildSupplyEnvelope() {
  return envelope((state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push(
      {
        id: "hand-wood",
        material: "wood",
        quantity: 1,
        location: { kind: "hand", actor: "rowan" },
      },
      {
        id: "wood-rest",
        material: "wood",
        quantity: 5,
        location: { kind: "ground", ...cell(4, 4) },
      },
    );
    state.materials.transfers.push(
      transfer("transfer-build", {
        phase: { kind: "carrying", lot: "hand-wood" },
      }),
    );
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-build",
      target: "transfer-build",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
    state.felled = 1;
  });
}

test("v7 snapshots omit commands and restore paused without any historical reader", () => {
  const state = createClearing();
  state.commands.push({
    kind: "recruit",
    party: "home",
    actor: "sedge",
    tick: 0,
  });
  const saved = snapshotFor(state);
  assert.equal(saved.schema, 7);
  assert.equal("commands" in saved.savedState, false);
  const restored = restoreSnapshot(saved);
  assert.deepEqual(restored.state.commands, []);
  assert.equal(restored.state.paused, true);
});

test("current-v7 revision admission distinguishes absent, malformed, and stale slots", () => {
  assert.deepEqual(decideSaveRevision(undefined, 0), {
    kind: "write",
    revision: 1,
  });
  assert.deepEqual(decideSaveRevision({ schema: 0 }, 0), { kind: "malformed" });
  const saved = snapshotFor(createClearing());
  saved.revision = 3;
  assert.deepEqual(decideSaveRevision(saved, 2), {
    kind: "stale",
    currentRevision: 3,
  });
  assert.deepEqual(decideReplaceRevision(undefined, 0, "discardMalformed"), {
    kind: "stale",
    currentRevision: 0,
  });
});

test("restore accepts an active build-supply transfer and rejects owner/request contrasts", () => {
  assert.doesNotThrow(() => restoreSnapshot(buildSupplyEnvelope()));

  const tasklessCarrying = buildSupplyEnvelope();
  tasklessCarrying.savedState.actors.rowan.task = null;
  tasklessCarrying.savedState.actors.rowan.assignment = null;
  assert.doesNotThrow(() => restoreSnapshot(tasklessCarrying));

  const ordinaryBuild = envelope((state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.actors.rowan.task = {
      kind: "build",
      job: "job-build",
      target: "site-a",
      duration: 24,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
  });
  assert.doesNotThrow(() => restoreSnapshot(ordinaryBuild));

  const wrongOwner = buildSupplyEnvelope();
  wrongOwner.savedState.jobs.push(job("job-other", "build", "site-a"));
  wrongOwner.savedState.materials.transfers[0].owner.job = "job-other";
  assert.throws(
    () => restoreSnapshot(wrongOwner),
    /inconsistent task activity/,
  );

  const wrongRequest = buildSupplyEnvelope();
  wrongRequest.savedState.sites.push(site("site-b", "wall", { x: 6 }));
  wrongRequest.savedState.materials.transfers[0].request.destination =
    "construction-buffer:site-b";
  assert.throws(
    () => restoreSnapshot(wrongRequest),
    /does not match owner destination/,
  );
});

test("restore accepts one full embedding for every finished construction site", () => {
  const finished = envelope((state) => {
    const wall = site("wall-a", "wall", { finishedAt: 1 });
    state.sites.push(wall);
    state.materials.lots.push({
      id: "wood-rest",
      material: "wood",
      quantity: 5,
      location: { kind: "ground", ...cell(4, 4) },
    });
    state.materials.embedded.push({
      container: "construction-buffer:wall-a",
      material: "wood",
      quantity: 1,
    });
    state.felled = 1;
  });
  assert.doesNotThrow(() => restoreSnapshot(finished));
});

rejects(
  "restore rejects duplicate live material lot IDs",
  (state) => {
    state.materials.lots.push(
      {
        id: "lot-a",
        material: "wood",
        quantity: 1,
        location: { kind: "ground", ...cell() },
      },
      {
        id: "lot-a",
        material: "wood",
        quantity: 1,
        location: { kind: "ground", ...cell(6) },
      },
    );
  },
  /duplicate material lot lot-a/,
);

rejects(
  "restore rejects duplicate current job IDs",
  (state) => {
    state.jobs.push(job("job-a"), job("job-a"));
  },
  /duplicate job ID/,
);

rejects(
  "restore rejects duplicate current site IDs",
  (state) => {
    state.sites.push(site("site-a"), site("site-a", "door"));
  },
  /duplicate site ID/,
);

rejects(
  "restore rejects duplicate transfer IDs before transfer joins",
  (state) => {
    state.materials.transfers.push(
      transfer("transfer-a"),
      transfer("transfer-a"),
    );
  },
  /duplicate transfer transfer-a/,
);

rejects(
  "restore rejects hand lots without exactly one carrying transfer",
  (state) => {
    state.materials.lots.push({
      id: "hand-a",
      material: "wood",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    });
  },
  /lacks unique transfer custody/,
);

rejects(
  "restore rejects container lots outside an accepted live destination",
  (state) => {
    state.materials.lots.push({
      id: "stored-a",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: "shelf:missing" },
    });
  },
  /unknown destination shelf:missing/,
);

rejects(
  "restore rejects embedded entries without a finished construction buffer",
  (state) => {
    state.materials.embedded.push({
      container: "construction-buffer:missing",
      material: "wood",
      quantity: 1,
    });
  },
  /embedded material has unknown container/,
);

rejects(
  "restore rejects a transfer whose owner job is absent",
  (state) => {
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(transfer("transfer-a"));
  },
  /transfer transfer-a has missing job/,
);

rejects(
  "restore rejects transfer owner and destination disagreement",
  (state) => {
    state.sites.push(site("site-a"), site("site-b", "door", { x: 6 }));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        request: {
          source: { kind: "eligible-ground", material: "wood" },
          quantityPolicy: "portion",
          quantity: 1,
          destination: "construction-buffer:site-b",
        },
      }),
    );
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-build",
      target: "transfer-a",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
  },
  /does not match owner destination/,
);

rejects(
  "restore rejects transfer phase quantities and source joins",
  (state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        phase: { kind: "reserved", sourceLot: "wood-a", quantity: 2 },
      }),
    );
  },
  /mismatched quantity/,
);

rejects(
  "restore rejects aggregate reserved quantities over a source lot",
  (state) => {
    state.sites.push(site("site-a"), site("site-b", "wall", { x: 6 }));
    state.jobs.push(
      job("job-a", "build", "site-a"),
      job("job-b", "build", "site-b"),
    );
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        owner: { job: "job-a", step: "one" },
        request: {
          source: { kind: "eligible-ground", material: "wood" },
          quantityPolicy: "portion",
          quantity: 1,
          destination: "construction-buffer:site-a",
        },
      }),
      transfer("transfer-b", {
        actor: "sedge",
        owner: { job: "job-b", step: "two" },
        request: {
          source: { kind: "eligible-ground", material: "wood" },
          quantityPolicy: "portion",
          quantity: 1,
          destination: "construction-buffer:site-b",
        },
      }),
    );
    state.parties.home.members.push("sedge");
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-a",
      target: "transfer-a",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-a",
      cost: 1,
    };
    state.actors.sedge.task = {
      kind: "transfer",
      job: "job-b",
      target: "transfer-b",
      duration: 8,
    };
    state.actors.sedge.assignment = {
      character: "sedge",
      task: "job-b",
      cost: 1,
    };
  },
  /reserved source wood-a exceeds quantity/,
);

rejects(
  "restore rejects occupied plus incoming material beyond a resolved container capacity",
  (state) => {
    state.sites.push(site("site-a", "door"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push(
      {
        id: "wood-stored",
        material: "wood",
        quantity: 1,
        location: {
          kind: "container",
          container: "construction-buffer:site-a",
        },
      },
      {
        id: "wood-a",
        material: "wood",
        quantity: 2,
        location: { kind: "ground", ...cell() },
      },
    );
    state.materials.transfers.push(
      transfer("transfer-a", {
        request: {
          source: { kind: "eligible-ground", material: "wood" },
          quantityPolicy: "portion",
          quantity: 2,
          destination: "construction-buffer:site-a",
        },
        phase: { kind: "reserved", sourceLot: "wood-a", quantity: 2 },
      }),
    );
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-build",
      target: "transfer-a",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
  },
  /container construction-buffer:site-a exceeds capacity/,
);

rejects(
  "restore requires a matching actor task for reserved transfers",
  (state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(transfer("transfer-a"));
  },
  /reserved transfer transfer-a lacks matching actor task/,
);

rejects(
  "restore rejects carrying material that does not match source or destination",
  (state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "hand-mugwort",
      material: "mugwort",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        phase: { kind: "carrying", lot: "hand-mugwort" },
      }),
    );
  },
  /carrying transfer transfer-a has invalid material/,
);

rejects(
  "restore rejects a finished site without its full construction embedding",
  (state) => {
    state.sites.push(site("site-a", "wall", { finishedAt: 1 }));
  },
  /finished site site-a lacks construction embedding/,
);

rejects(
  "restore rejects actor task, activity, assignment, and target disagreement",
  (state) => {
    state.jobs.push(job("job-chop", "chop", "oak-1"));
    state.actors.rowan.task = {
      kind: "build",
      job: "job-chop",
      target: "oak-1",
      duration: 1,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-chop",
      cost: 1,
    };
  },
  /inconsistent task activity/,
);

rejects(
  "restore rejects invalid actor paths",
  (state) => {
    state.actors.rowan.path = [{ x: -1, z: 0, level: 0 }];
  },
  /invalid path/,
);

rejects(
  "restore rejects unsupported current topology",
  (state) => {
    state.sites.push(site("floor-a", "floor", { level: 1 }));
  },
  /unsupported floor/,
);

rejects(
  "restore rejects unsupported finished roofs",
  (state) => {
    state.sites.push(site("roof-a", "roof", { finishedAt: 1 }));
    state.materials.embedded.push({
      container: "construction-buffer:roof-a",
      material: "wood",
      quantity: 1,
    });
  },
  /unsupported roof/,
);

rejects(
  "restore rejects current material conservation breaks",
  (state) => {
    state.felled = 1;
  },
  /wood conservation is 0, expected 6/,
);
