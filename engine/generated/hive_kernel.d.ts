/* tslint:disable */
/* eslint-disable */

export class WasmKernel {
    free(): void;
    [Symbol.dispose](): void;
    advance(json: string): string;
    /**
     * Run the native bounded joint assignment owner through a JSON wire
     * boundary. The JSON is deliberately bounded before deserialization so a
     * malformed host request cannot cause unbounded candidate allocation.
     */
    assign(json: string): string;
    atmosphere_samples(input: string): string;
    capture_records(): WasmKernelRecords;
    construction_access(input: string): string;
    construction_readiness(input: string): string;
    deconstruction_access(input: string): string;
    entity_membership(json: string): string;
    environment_facts(): string;
    floor_operations(input: string): string;
    load(json: string): void;
    load_environment(definition: string): void;
    constructor();
    party_join_identity(json: string): string;
    physical_contacts(input: string): string;
    process_requirements(input: string): string;
    query(json: string): string;
    render_facts(): string;
    restore(json: string): void;
    restore_records(records: WasmKernelRecords): void;
    route_costs(input: string): string;
    route_to_any(input: string): string;
    snapshot(): string;
    structure_surfaces(input: string): string;
    terrain_changes(input: string): string;
    terrain_materials(input: string): string;
    terrain_surfaces(input: string): string;
    transfer_contacts(input: string): string;
    water_contacts(input: string): string;
    work_attempt_for_worker(json: string): string;
    work_attempts(json: string): string;
    work_material_snapshot(): string;
    world_pose(json: string): string;
}

/**
 * Detached, bounded save bytes. This handle never mutates a live world.
 * The JS caller frees captures after copying; restore_records consumes its input.
 */
export class WasmKernelRecords {
    free(): void;
    [Symbol.dispose](): void;
    insert(key: string, bytes: Uint8Array): void;
    keys(): string;
    constructor();
    read(key: string): Uint8Array;
}

export function predict_direct(json: string): string;

/**
 * Pure native trajectory/contact preview.  It shares the bounded ballistic
 * integrator and Parry sweep with the authoritative projectile owner; the
 * supplied colliders are a labelled current-target estimate and never mutate
 * a Kernel or claim a future hit.
 */
export function preview_projectile(json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmkernel_free: (a: number, b: number) => void;
    readonly __wbg_wasmkernelrecords_free: (a: number, b: number) => void;
    readonly predict_direct: (a: number, b: number) => [number, number, number, number];
    readonly preview_projectile: (a: number, b: number) => [number, number, number, number];
    readonly wasmkernel_advance: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_assign: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_atmosphere_samples: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_capture_records: (a: number) => [number, number, number];
    readonly wasmkernel_construction_access: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_construction_readiness: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_deconstruction_access: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_entity_membership: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_environment_facts: (a: number) => [number, number, number, number];
    readonly wasmkernel_floor_operations: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_load: (a: number, b: number, c: number) => [number, number];
    readonly wasmkernel_load_environment: (a: number, b: number, c: number) => [number, number];
    readonly wasmkernel_new: () => number;
    readonly wasmkernel_party_join_identity: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_physical_contacts: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_process_requirements: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_query: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_render_facts: (a: number) => [number, number, number, number];
    readonly wasmkernel_restore: (a: number, b: number, c: number) => [number, number];
    readonly wasmkernel_restore_records: (a: number, b: number) => [number, number];
    readonly wasmkernel_route_costs: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_route_to_any: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_snapshot: (a: number) => [number, number, number, number];
    readonly wasmkernel_structure_surfaces: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_terrain_changes: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_terrain_materials: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_terrain_surfaces: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_transfer_contacts: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_water_contacts: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_work_attempt_for_worker: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_work_attempts: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernel_work_material_snapshot: (a: number) => [number, number, number, number];
    readonly wasmkernel_world_pose: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmkernelrecords_insert: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmkernelrecords_keys: (a: number) => [number, number, number, number];
    readonly wasmkernelrecords_new: () => number;
    readonly wasmkernelrecords_read: (a: number, b: number, c: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
