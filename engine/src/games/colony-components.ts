import { component } from "../sdk/authoring";

/** Shared colony identity capability; work providers query the same owner. */
export const Worker = component<{ guest: boolean }>("colony.worker", {
  version: 1,
  fields: { guest: "boolean" },
});
