import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ConstructionSite } from "./construction";
import { Body, Container, Position, Traversal } from "./common";
import { OwnedByParty, PartyMember } from "./party";
import { constructionWorkProvider } from "./construction-work";
import type { QueryRow, QuerySpec, WriteContext } from "../contracts";

const worker = "worker.builder" as const;
const site = "site.floor" as const;
const party = "party.colony" as const;
const row = (id: string, values: Record<string, unknown>): QueryRow<any> => ({ id, get: (d: {id:string}) => values[d.id] } as QueryRow<any>);
function fixture() {
  const records = [
    row(site, { [ConstructionSite.id]: { catalog:"floor", x:1, y:0, z:1, orientation:"north", worker:null, seconds:1, phase:"planned" }, [OwnedByParty.id]: { party } }),
    row(worker, { [PartyMember.id]: { party }, [Body.id]: { speed:1 }, [Container.id]: { capacity:8 }, [Traversal.id]: { clearanceCells:1,maxStepCells:1 }, [Position.id]: { x:0,y:0.5,z:0,facing:0 } }),
  ];
  const actions: unknown[] = [];
  const base = {
    query: (spec: QuerySpec<any>) => records.filter(r => spec.components.every(c => r.get(c) !== undefined)),
    constructionAccess: () => [{ site, support:"ready", materialsReady:true, contacts:[{x:1,y:0.5,z:1,frame:null,kind:"origin" as const}], removal:"ready" as const, salvageQuantity:0, workSeconds:1 }],
    worldPoses: () => [{ id:worker, local:{x:0,y:0.5,z:0,facing:0}, world:{x:0,y:0.5,z:0,facing:0}, support:null, surface:null }],
    routeToAny: () => ({ actor:worker, status:"reachable" as const, targetIndex:0, cost:1 }),
    workAttempts: () => [], assign: (x: any) => x, action: (x: unknown) => actions.push(x),
  } as unknown as WriteContext;
  return { base, actions };
}
test("construction provider begins one owned route attempt for a planned site", () => {
  const f=fixture(); const p=constructionWorkProvider(f.base,{workers:[worker]},new Set());
  assert.equal(p.candidates.length,1); p.estimate(p.candidates[0]); p.apply([{worker,task:site,cost:1}]);
  assert.deepEqual(f.actions,[{kind:"begin-work-attempt",task:site,worker,party,operation:{kind:"route",destination:{x:1,y:0.5,z:1,frame:null}}}]);
});
test("construction provider rejects cross-party workers", () => {
  const f=fixture(); const rows=f.base.query; (f.base as any).query=(spec: QuerySpec<any>) => rows(spec).map(r => r.id===worker ? row(worker,{ [PartyMember.id]:{party:"other"},[Body.id]:{speed:1},[Container.id]:{capacity:8},[Traversal.id]:{clearanceCells:1,maxStepCells:1},[Position.id]:{x:0,y:0.5,z:0,facing:0}}) : r);
  assert.equal(constructionWorkProvider(f.base,{workers:[worker]},new Set()).candidates.length,0);
});
