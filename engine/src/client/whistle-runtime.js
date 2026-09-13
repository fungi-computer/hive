import { createWhistle } from "@fungi.computer/whistle";

/** Project only the owning pack's local acquisition data into Whistle custom data. */
export function localBindings(pack) {
  return Object.freeze(Object.entries(pack.commands ?? {}).flatMap(([name, command]) =>
    (command.localPresentation?.bindings ?? []).map(binding => Object.freeze({ ...binding, commandId: `${pack.id}:${name}` }))
  ));
}

function commandName(commandId) {
  const separator = commandId.indexOf(":");
  if (separator <= 0 || separator === commandId.length - 1) throw new Error(`invalid Whistle command ID ${commandId}`);
  return commandId.slice(separator + 1);
}

function bindingPresentation(bindings) {
  if (!bindings.length) return undefined;
  return { type: "custom", data: { bindings: bindings.map(binding => ({
    id: binding.id,
    label: binding.label,
    ...(binding.detail === undefined ? {} : { detail: binding.detail }),
    ...(binding.selection === undefined ? {} : { selection: binding.selection }),
    ...(binding.target === undefined ? {} : { target: binding.target }),
    ...(binding.designation === undefined ? {} : { designation: [...binding.designation] }),
    ...(binding.preset === undefined ? {} : { preset: structuredClone(binding.preset) }),
  })) } };
}

function contributionCommands(rows, bindingsByCommand, submit, latest) {
  return rows.map((row, order) => {
    const bindings = bindingsByCommand.get(row.commandId) ?? [];
    const id = commandName(row.commandId);
    return {
      id,
      title: row.title,
      category: row.category,
      ...(row.description === undefined ? {} : { description: row.description }),
      projections: { agent: { order }, ...(bindings.length ? { menu: { order }, palette: { order } } : {}) },
      action: { ...(row.action === undefined ? {} : row.action), ...(bindings.length ? { presentation: bindingPresentation(bindings) } : {}) },
      availability: () => latest.get(row.commandId)?.availability ?? row.availability,
      handler: ({ arguments: input }) => submit({ type: "command", name: id, ...(input === undefined ? {} : { input }) }),
    };
  });
}

/** One local Whistle owner for the current client and its durable runtime. */
export function createLocalGameWhistle({ agent = [], bindings = [], submit }) {
  if (typeof submit !== "function") throw new TypeError("durable command submitter is required");
  const latest = new Map(agent.map(row => [row.commandId, row]));
  const bindingsByCommand = new Map();
  for (const binding of bindings) {
    const list = bindingsByCommand.get(binding.commandId) ?? [];
    list.push(binding);
    bindingsByCommand.set(binding.commandId, list);
  }
  const whistle = createWhistle();
  let lease;
  let installedIdentity;
  const update = nextAgent => {
    latest.clear();
    for (const row of nextAgent) latest.set(row.commandId, row);
    const rows = [...nextAgent].sort((left, right) => left.commandId.localeCompare(right.commandId));
    const identity = rows.map(row => `${row.commandId}\u0000${JSON.stringify(row.action?.inputSchema ?? null)}`).join("\u0001");
    if (identity === installedIdentity) return;
    if (!lease && rows.length === 0) {
      installedIdentity = identity;
      return;
    }
    const namespace = rows[0]?.commandId.split(":")[0] ?? "hive";
    const commands = contributionCommands(rows, bindingsByCommand, submit, latest);
    // The vendored Whistle contract replaces a contribution by disposing its
    // generation and contributing the new immutable command set.
    if (lease) lease.dispose();
    lease = whistle.contribute({ sourceId: `hive.client.${namespace}`, namespace, commands });
    installedIdentity = identity;
  };
  update(agent);
  return Object.freeze({ whistle, update });
}
