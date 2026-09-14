// Small browser consumer for the shared Colony v2 protocol. Credentials are
// generated once per world and stored before the first join, so reloads and
// multiple tabs replay the same membership.
const HEX = /^[a-f0-9]{64}$/;
const keyFor = (world) => `hive:colony-v2:credential:${world}`;

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function openColonyWorld({ baseUrl = location.origin, invite, storage = localStorage } = {}) {
  if (typeof invite !== "string") throw new Error("Colony invite is required");
  const world = await digest(invite);
  let credential = storage.getItem(keyFor(world));
  if (!HEX.test(credential ?? "")) {
    credential = hex(crypto.getRandomValues(new Uint8Array(32)));
    storage.setItem(keyFor(world), credential);
  }
  const base = `${baseUrl.replace(/\/$/, "")}/v2/colony/worlds/${world}`;
  const join = await fetch(`${base}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
    body: JSON.stringify({ invite }),
  });
  if (!join.ok) throw new Error(`Colony join failed (${join.status})`);
  return {
    world,
    credential,
    membership: await join.json(),
    observe: () => fetch(`${base}/observe`, { headers: { Authorization: `Bearer ${credential}` } }).then(response => response.json()),
    command: (body) => fetch(`${base}/command`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(response => response.json()),
    socketUrl: `${base}/socket/client`,
  };
}
