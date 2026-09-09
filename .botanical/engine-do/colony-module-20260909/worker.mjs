import createColony from './colony.mjs';
import colonyWasm from './colony.wasm';

export class ColonySmoke {
  constructor() {
    this.ready = createColony({
      instantiateWasm(imports, receiveInstance) {
        const instance = new WebAssembly.Instance(colonyWasm, imports);
        receiveInstance(instance, colonyWasm);
        return instance.exports;
      },
    });
  }
  async fetch() {
    const colony = await this.ready;
    const initialized = true;
    const offered = [];
    for (let person = 0; person < 5; person++) {
      for (let job = 0; job < 100; job++) {
        offered.push({
          character: `person-${person}`,
          task: `job-${job}`,
          cost: colony.compute_cost({
            travel_time: job === (person + 2) % 5 ? person : 100 + job,
            work_time: 1,
            priority: 1,
          }),
        });
      }
    }
    const heapBefore = colony.HEAPU8.length;
    let chosen;
    for (let run = 0; run < 100; run++) {
      chosen = colony.optimize(offered);
      if (chosen.length !== 5 ||
          new Set(chosen.map(({ character }) => character)).size !== 5 ||
          new Set(chosen.map(({ task }) => task)).size !== 5 ||
          chosen.some(({ character, task, cost }) => {
        const person = Number(character.slice(7));
        return task !== `job-${(person + 2) % 5}` || cost !== person + 1;
      })) throw new Error(`Unexpected assignment at run ${run}: ${JSON.stringify(chosen)}`);
    }
    return Response.json({ initialized, offeredCount: offered.length, runs: 100, chosen, heapBefore, heapAfter: colony.HEAPU8.length });
  }
}
export default { fetch(request, env) {
  return env.COLONY.get(env.COLONY.idFromName('bounded-smoke')).fetch(request);
}};
