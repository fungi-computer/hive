import createColony from "./colony.mjs";
export type Assignment = { character: string; task: string; cost: number };
export const OPTIMIZER_BUILD_ID = "b766aed9dbf46b7a85b3740a96a69daf78a5dd582df76eb040dcc450e75ac378:33d78e3451179d1e17d283837066a819d94ec0bba239dda4c6ce19edb7fcc0e9" as const;
export type Optimizer = {
  readonly buildId: string;
  compute_cost(input: { travel_time: number; work_time: number; priority: number; retry_risk?: number }): number;
  optimize(assignments: Assignment[]): Assignment[];
};
/** Host supplies its compiled module; no filesystem, network or DOM loader. */
export async function loadOptimizer(module: WebAssembly.Module): Promise<Optimizer> {
  const runtime = await createColony({
    instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
      const instance = new WebAssembly.Instance(module, imports);
      receive(instance, module);
      return instance.exports;
    },
  });
  const optimizer: Optimizer = Object.freeze({
    buildId: OPTIMIZER_BUILD_ID,
    compute_cost: (input: Parameters<Optimizer["compute_cost"]>[0]) => runtime.compute_cost(input),
    optimize: (assignments: Assignment[]) => runtime.optimize(assignments),
  });
  return optimizer;
}
/** Registered implementations declare compatibility; this is not code authentication. */
export function optimizerBuildIdentity(optimizer: Optimizer): string {
  if (!/^[a-f0-9]{64}:[a-f0-9]{64}$/.test(optimizer.buildId))
    throw new Error("invalid-optimizer-build-identity");
  return optimizer.buildId;
}
