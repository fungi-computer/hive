/** Read-only water/recovery diagnostics on the pinned framework-v2 workload. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session";
import { wasmKernelPort } from "../src/runtime/wasm-kernel";
import { createColonyFrameworkProofV2Pack } from "../src/games/colony-performance";
import { driveColonyFrameworkProofV2 } from "../src/games/colony-framework-proof-v2-driver";
import { MaterialLot, Position } from "../src/sdk/common";
import { FieldWaterWork } from "../src/sdk/process-supply";
import { query } from "../src/sdk/authoring";
const wasm = readFileSync("engine/generated/hive_kernel_bg.wasm");
initSync({ module: wasm });
const pack = createColonyFrameworkProofV2Pack(),
  port = wasmKernelPort(new WasmKernel()),
  recoveryPort = wasmKernelPort(new WasmKernel());
const session = new GameSession({ port, pack });
const steps = Number(
  process.argv.find((arg) => arg.startsWith("--steps="))?.slice(8) ?? 1800,
);
if (!Number.isSafeInteger(steps) || steps < 0 || steps > 1800)
  throw new Error("steps must be an integer from0 through1800");
try {
  session.start();
  for (let step = 1; step <= steps; step++) {
    driveColonyFrameworkProofV2(session, step);
    session.runDisposableCandidate(() => session.step(0.1));
  }
  const snapshot = session.save();
  const recovered = new GameSession({ port: recoveryPort, pack });
  recovered.restore(snapshot);
  const before = session.environmentFacts() as Record<string, unknown>,
    after = recovered.environmentFacts() as Record<string, unknown>;
  const differences = Object.keys(before)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
  const lots = session.query(query(MaterialLot));
  const pails = lots
    .filter((row) => row.get(MaterialLot).kind === "pail")
    .map((row) => ({ id: row.id, worker: row.get(MaterialLot).container }));
  const positions = new Map(
    session.query(query(Position)).map((row) => [row.id, row.get(Position)]),
  );
  const workers = pails.map((pail) => ({
    ...pail,
    position: positions.get(pail.worker),
    attempt: port.workAttemptForWorker(pail.worker),
  }));
  const contacts = workers.map((worker) => ({
    worker: worker.worker,
    contacts: port.waterContacts([
      [worker.position!.x, worker.position!.y, worker.position!.z],
    ]),
  }));
  const environment = JSON.parse(
    new TextDecoder().decode(pack.environmentDefinition),
  );
  const sea = environment.world.seaLevel;
  const columns: [number, number][] = [];
  for (let x = -128; x < 128; x++)
    for (let z = -128; z < 128; z++) columns.push([x, z]);
  const surfaces: { cell: readonly number[] }[] = [];
  for (let start = 0; start < columns.length; start += 64)
    surfaces.push(
      ...session
        .terrainSurfaces(columns.slice(start, start + 64))
        .filter((value) => value !== null),
    );
  const wet = surfaces.filter((surface) => surface.cell[1] < sea - 1);
  const candidateSea = 15;
  const surfaceByColumn = new Map(
    surfaces.map((surface) => [
      `${surface.cell[0]},${surface.cell[2]}`,
      surface.cell,
    ]),
  );
  const shore = surfaces
    .filter((surface) => surface.cell[1] < candidateSea - 1)
    .flatMap((surface) => {
      const [x, , z] = surface.cell;
      const approaches = [
        [x - 1, z],
        [x + 1, z],
        [x, z - 1],
        [x, z + 1],
      ]
        .map(([ax, az]) => surfaceByColumn.get(`${ax},${az}`))
        .filter(
          (cell) =>
            cell && cell[1] >= candidateSea - 1 && cell[1] <= candidateSea,
        );
      return approaches.length
        ? [{ cell: [x, candidateSea - 1, z], approaches }]
        : [];
    });
  const originalWorkers = JSON.parse(
    new TextDecoder().decode(pack.definition),
  ).initial.filter(
    (row: { components: Record<string, unknown> }) =>
      row.components["colony.worker"],
  );
  const occupied = new Set(
    environment.initialPlacements.map((placement: { column: number[] }) =>
      placement.column.join(","),
    ),
  );
  const relocations = originalWorkers.flatMap((row: { id: string }) => {
    const position = positions.get(row.id)!;
    if (position.y / environment.world.verticalMetres - 0.5 >= candidateSea - 1)
      return [];
    const candidate = surfaces
      .filter(
        (surface) =>
          surface.cell[1] >= candidateSea - 1 &&
          !occupied.has(`${surface.cell[0]},${surface.cell[2]}`),
      )
      .map((surface) => ({
        cell: surface.cell,
        distance: Math.hypot(
          surface.cell[0] - position.x,
          surface.cell[2] - position.z,
        ),
      }))
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.cell[0] - b.cell[0] ||
          a.cell[2] - b.cell[2],
      )[0];
    occupied.add(`${candidate.cell[0]},${candidate.cell[2]}`);
    return [
      {
        entity: row.id,
        from: [position.x, position.z],
        to: [candidate.cell[0], candidate.cell[2]],
        support: candidate.cell[1],
        distance: candidate.distance,
      },
    ];
  });
  const v3Proposal = {
    seaLevel: candidateSea,
    relocations,
    submergedWorkerPositions: originalWorkers
      .map((row: { id: string }) => ({
        id: row.id,
        position: positions.get(row.id),
      }))
      .filter(
        (row: { position: { y: number } }) =>
          row.position.y / environment.world.verticalMetres - 0.5 <
          candidateSea - 1,
      ),
    shoreCells: shore.length,
    nearestShore: workers.map((worker) => ({
      worker: worker.worker,
      candidates: shore
        .map((site) => ({
          ...site,
          distance: Math.min(
            ...site.approaches.map((cell) =>
              Math.hypot(
                cell![0] - worker.position!.x,
                cell![2] - worker.position!.z,
              ),
            ),
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 1),
    })),
  };
  const nearestWet = workers.map((worker) => ({
    worker: worker.worker,
    cells: wet
      .map((surface) => ({
        cell: surface.cell,
        distance: Math.hypot(
          surface.cell[0] - worker.position!.x,
          surface.cell[2] - worker.position!.z,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4),
  }));
  console.log(
    JSON.stringify(
      {
        fixture: pack.id,
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        steps,
        definitionSha256: createHash("sha256")
          .update(pack.definition)
          .digest("hex"),
        environmentSha256: createHash("sha256")
          .update(pack.environmentDefinition!)
          .digest("hex"),
        physicalEnvironmentMatches: differences.every(
          (difference) => difference.key === "placementRevision",
        ),
        wasmSha256: createHash("sha256").update(wasm).digest("hex"),
        differences,
        workers,
        contacts,
        waterWork: session
          .query(query(FieldWaterWork))
          .map((row) => ({ id: row.id, work: row.get(FieldWaterWork) })),
        waterLots: lots
          .filter((row) => row.get(MaterialLot).kind === "water")
          .map((row) => row.get(MaterialLot)),
        openCells: (before.cells as { kind: string; massKg: number }[]).filter(
          (cell) => cell.kind === "void",
        ),
        observedCells: (
          before.cells as { kind: string; massKg: number }[]
        ).reduce(
          (sum, cell) => {
            sum[cell.kind] = (sum[cell.kind] ?? 0) + cell.massKg;
            return sum;
          },
          {} as Record<string, number>,
        ),
        sampledWetColumns: wet.length,
        v3Proposal,
        surfaceRange: {
          count: surfaces.length,
          min: Math.min(...surfaces.map((surface) => surface.cell[1])),
          max: Math.max(...surfaces.map((surface) => surface.cell[1])),
          sea,
        },
        nearestWet,
      },
      null,
      2,
    ),
  );
} finally {
  port.dispose();
  recoveryPort.dispose();
}
