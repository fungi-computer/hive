import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [clientArgument, backendArgument, outputArgument] = process.argv.slice(2);
if (!clientArgument || !backendArgument || !outputArgument || process.argv.length !== 5) {
  throw new Error("Usage: node verify-clearing-pair.mjs <client-origin> <backend-origin> <output-json>");
}

function exactHttpsOrigin(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value) throw new Error(`${label} must be an exact HTTPS origin`);
  return url.origin;
}
const client = exactHttpsOrigin(clientArgument, "client origin");
const backend = exactHttpsOrigin(backendArgument, "backend origin");
const output = resolve(outputArgument);
const invite = randomBytes(32).toString("hex");
const credential = randomBytes(32).toString("hex");
const world = createHash("sha256").update(invite).digest("hex");
const joinUrl = `${backend}/v2/colony/worlds/${world}/join`;
const headers = { Origin: client };

function requireCors(response, label) {
  if (response.headers.get("access-control-allow-origin") !== client)
    throw new Error(`${label} did not authorize the published client origin`);
}
function requireOk(response, label) {
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
}

const htmlResponse = await fetch(`${client}/engine/colony.html`, { headers: { "cache-control": "no-cache, no-store" } });
requireOk(htmlResponse, "Colony entry");
const html = await htmlResponse.text();
if (!/<script[^>]+type=["']module["'][^>]+src=/.test(html)) throw new Error("Colony entry has no module script");

const preflight = await fetch(joinUrl, {
  method: "OPTIONS",
  headers: {
    ...headers,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});
if (preflight.status !== 204) throw new Error(`Colony preflight failed with HTTP ${preflight.status}`);
requireCors(preflight, "Colony preflight");

const join = await fetch(joinUrl, {
  method: "POST",
  headers: { ...headers, Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
  body: JSON.stringify({ invite }),
});
requireOk(join, "Colony join");
requireCors(join, "Colony join");
const party = await join.json();
if (typeof party?.player !== "string" || typeof party?.party !== "string" || !Array.isArray(party?.people) || party.people.length !== 2)
  throw new Error("Colony join returned an invalid party");

const observe = await fetch(`${backend}/v2/colony/worlds/${world}/observe`, {
  headers: { ...headers, Authorization: `Bearer ${credential}` },
});
requireOk(observe, "Colony observation");
requireCors(observe, "Colony observation");
const wire = await observe.json();
if (!Number.isSafeInteger(wire?.revision) || !wire?.observation || typeof wire.observation !== "object")
  throw new Error("Colony observation returned an invalid authoritative frame");

const report = {
  status: "passed",
  client,
  backend,
  entryBytes: Buffer.byteLength(html),
  revision: wire.revision,
  partySize: party.people.length,
  observedSubjects: Array.isArray(wire.observation.subjects) ? wire.observation.subjects.length : null,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, output }));
