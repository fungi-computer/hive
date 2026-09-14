import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const [distArgument, originArgument, outputArgument] = process.argv.slice(2);
if (
  !distArgument ||
  !originArgument ||
  !outputArgument ||
  process.argv.length !== 5
) {
  throw new Error(
    "Usage: node verify-static-preview.mjs <dist-directory> <preview-origin> <output-json>",
  );
}

const dist = resolve(distArgument);
const origin = new URL(originArgument);
if (origin.protocol !== "https:" || origin.origin !== originArgument) {
  throw new Error(
    "Supply the exact HTTPS preview origin without a trailing slash",
  );
}

const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) files.push(path);
  }
}
await collect(dist);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const results = [];
for (const path of files.sort()) {
  const name = relative(dist, path).split(sep).join("/");
  const local = await readFile(path);
  const url = new URL(`/${name}`, origin);
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache, no-store" },
  });
  const remote = Buffer.from(await response.arrayBuffer());
  const localSha256 = sha256(local);
  const remoteSha256 = sha256(remote);
  results.push({
    name,
    status: response.status,
    bytes: remote.byteLength,
    localSha256,
    remoteSha256,
    matches: response.ok && localSha256 === remoteSha256,
  });
}

const failures = results.filter((result) => !result.matches);
const output = resolve(outputArgument);
const report = {
  origin: origin.origin,
  dist,
  files: results.length,
  matching: results.length - failures.length,
  failures,
  results,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    origin: report.origin,
    files: report.files,
    matching: report.matching,
    failures: failures.length,
    output,
  }),
);
if (failures.length > 0) process.exitCode = 1;
