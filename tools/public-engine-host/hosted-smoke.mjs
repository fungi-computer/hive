import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const endpoint = argument("--endpoint");
const output = argument("--output");
assert(endpoint && output, "Usage: node hosted-smoke.mjs --endpoint <url> --output <directory> [--origin <frontend-origin>]");
const base = endpoint.replace(/\/$/, "");
const origin = argument("--origin") ?? new URL(base).origin;
const packs = ["survival", "pirates", "colony", "formations"];
const tokens = new Map(packs.map((pack) => [pack, randomBytes(32).toString("hex")]));
const results = [];

function id(prefix) { return `${prefix}-${randomBytes(12).toString("hex")}`; }
function url(pack, path) { return `${base}/v1/${pack}/${path}`; }
function auth(token) { return { Authorization: `Bearer ${token}` }; }
function request(input, init) { return fetch(input, { ...init, signal: AbortSignal.timeout(10000) }); }
async function jsonResponse(response) {
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = undefined; }
  return { response, text, value };
}
async function observe(pack, token) {
  const { response, text, value } = await jsonResponse(await request(url(pack, "observe"), { headers: auth(token) }));
  assert.equal(response.status, 200, `${pack} observe failed (${response.status})`);
  assert(value && Number.isSafeInteger(value.revision) && value.revision >= 0, `${pack} observation revision invalid`);
  assert(value.observation && typeof value.observation.paused === "boolean", `${pack} observation state invalid`);
  return { wire: value, bytes: text.length };
}
async function command(pack, token, body) {
  const { response, text, value } = await jsonResponse(await request(url(pack, "command"), {
    method: "POST", headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  assert.equal(response.status, 200, `${pack} command failed (${response.status})`);
  assert(value && value.commandId === body.id, `${pack} command receipt identity mismatch`);
  assert(value.status === "applied" || value.status === "rejected", `${pack} command receipt status invalid`);
  return { wire: value, bytes: text.length };
}
async function preflight(pack) {
  const response = await request(url(pack, "command"), {
    method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  assert.equal(response.status, 204, `CORS preflight status ${response.status}`);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin, "CORS origin mismatch");
  assert.match(response.headers.get("Access-Control-Allow-Methods") ?? "", /(^|,)\s*POST\s*(,|$)/i);
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /authorization/i);
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /content-type/i);
}
function body(kind, revision, prefix) { return { id: id(prefix), expectedRevision: revision, command: { kind } }; }
async function admitted(pack, token, kind, prefix) {
  const attempts = [];
  for (let index = 0; index < 3; index++) {
    const fresh = await observe(pack, token);
    const envelope = body(kind, fresh.wire.revision, `${prefix}-${index}`);
    const receipt = await command(pack, token, envelope);
    if (receipt.wire.status === "applied") return { envelope, receipt, staleAttempts: attempts };
    assert.equal(receipt.wire.reason, "stale-revision", `${pack} unexpected ${kind} rejection`);
    attempts.push({ id: envelope.id, status: "rejected", reason: receipt.wire.reason });
  }
  throw new Error(`${pack} ${kind} admission remained stale after 3 attempts`);
}
async function pauseWithLostResponse(pack, token) {
  const applied = await admitted(pack, token, "pause", "pause");
  const retry = await command(pack, token, applied.envelope);
  assert.deepEqual(retry.wire, applied.receipt.wire, `${pack} replay receipt changed after response loss`);
  return { commandId: applied.envelope.id, receipt: retry.wire, identical: true, staleAttempts: applied.staleAttempts };
}

try {
  const missing = await request(url("survival", "observe"));
  assert.equal(missing.status, 403, "missing bearer token was accepted");
  await preflight("survival");
  for (const pack of packs) {
    const token = tokens.get(pack);
    const initial = await observe(pack, token);
    const paused = await pauseWithLostResponse(pack, token);
    const pausedObservation = await observe(pack, token);
    assert.equal(pausedObservation.wire.observation.paused, true, `${pack} did not pause`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const pausedAgain = await observe(pack, token);
    assert.equal(pausedAgain.wire.revision, pausedObservation.wire.revision, `${pack} changed while paused`);
    const resumed = await admitted(pack, token, "resume", "resume");
    const resumeDeadline = Date.now() + 8000;
    let advanced;
    while (Date.now() < resumeDeadline) {
      const current = await observe(pack, token);
      if (current.wire.revision > pausedAgain.wire.revision && current.wire.observation.time > pausedAgain.wire.observation.time) { advanced = current; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(advanced, `${pack} physical time did not advance after resume`);
    await admitted(pack, token, "pause", "final-pause");
    const final = await observe(pack, token);
    assert.equal(final.wire.observation.paused, true, `${pack} was not left paused`);
    results.push({ pack, initialRevision: initial.wire.revision, staleAttempts: paused.staleAttempts, replay: paused, resumedRevision: advanced.wire.revision, finalRevision: final.wire.revision, finalPaused: true });
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output.replace(/\/$/, "")}/hosted-smoke.json`, JSON.stringify({ status: "passed", origin, packs: results }, null, 2));
  console.log(JSON.stringify({ status: "passed", packs: results.map(({ pack, finalRevision }) => ({ pack, finalRevision })) }));
} catch (error) {
  await mkdir(output, { recursive: true });
  await writeFile(`${output.replace(/\/$/, "")}/hosted-smoke.json`, JSON.stringify({ status: "failed", error: String(error).replaceAll(/Bearer\s+[a-f0-9]{64}/gi, "Bearer [redacted]"), packs: results }, null, 2));
  throw error;
}
