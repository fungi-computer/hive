import type { Clearing } from "./model.ts";
import type { ContainerSpec } from "./materials.ts";
import { siteMaterialEndpoints } from "./construction.js";
import {
  cacheRepairBuffer,
  sourceContainerSpec,
  sourcePailContainerSpec,
  sourceSuppliesContainerSpec,
} from "./finite-sources.ts";
import { portableContainerInterior } from "./item-containers.ts";

/** The current game endpoint definitions shared by settlement and restoration. */
export function materialContainerFacts(
  state: Pick<Clearing, "sites" | "sources" | "materials">,
): ContainerSpec[] {
  const containers: ContainerSpec[] = [];
  for (const site of state.sites)
    for (const endpoint of siteMaterialEndpoints(site))
      containers.push(endpoint.destination);
  for (const feature of state.sources) {
    containers.push(sourceContainerSpec(feature));
    const repair = cacheRepairBuffer(feature);
    if (feature.kind === "reclaimed-timber-cache" && !feature.repaired)
      containers.push(repair!);
    const pail = sourcePailContainerSpec(feature);
    if (pail) containers.push(pail);
    const supplies = sourceSuppliesContainerSpec(feature);
    if (supplies) containers.push(supplies);
  }
  for (const lot of state.materials.lots) {
    const interior = portableContainerInterior(lot);
    if (interior) containers.push(interior);
  }
  return containers;
}
