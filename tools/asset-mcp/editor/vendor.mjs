// Reproduce the pinned public editor resource closure; never reads Fiend source.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { createHash } from "node:crypto";
import { parseAst } from "rollup/parseAst";
const root = new URL("./vendor/", import.meta.url);
const commit = "e69f76ed41069827b72550d9a4b1e3901ab61e3b";
const upstream = `https://raw.githubusercontent.com/mrdoob/three.js/${commit}/`;
const records = new Map();
const prior = new Map(
  JSON.parse(
    await readFile(
      new URL("./resource-manifest.json", import.meta.url),
      "utf8",
    ).catch(() => '{"files":[]}'),
  ).files.map((item) => [item.path, item]),
);
async function fetchFile(path, url = upstream + path) {
  if (records.has(path)) return;
  const cached = prior.get(path);
  if (cached?.source === url) {
    const bytes = await readFile(new URL(path, root)).catch(() => null);
    if (
      bytes &&
      createHash("sha256").update(bytes).digest("hex") === cached.sha256
    ) {
      records.set(path, cached);
      return;
    }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(new URL(path, root).pathname), { recursive: true });
  await writeFile(new URL(path, root), bytes);
  records.set(path, {
    path,
    source: url,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const treeResponse = await fetch(
  `https://api.github.com/repos/mrdoob/three.js/git/trees/${commit}?recursive=1`,
);
if (!treeResponse.ok) throw new Error("Upstream tree unavailable");
const tree = await treeResponse.json();
if (tree.truncated) throw new Error("Truncated upstream resource tree");
const blobs = new Set(
  tree.tree.filter((item) => item.type === "blob").map((item) => item.path),
);
async function batch(paths) {
  for (let offset = 0; offset < paths.length; offset += 8)
    await Promise.all(
      paths.slice(offset, offset + 8).map((path) => fetchFile(path)),
    );
}
await batch(
  [...blobs].filter(
    (path) =>
      path.startsWith("editor/") ||
      path.startsWith("examples/fonts/") ||
      path.startsWith("examples/jsm/libs/") ||
      (path.startsWith("build/") && path.endsWith(".js")) ||
      path === "LICENSE" ||
      path === "package.json",
  ),
);
const dependencies = [
  [
    "external/pathtracer.js",
    "https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/build/index.module.js",
  ],
  [
    "external/pathtracer-LICENSE",
    "https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/LICENSE",
  ],
  [
    "external/bvh.js",
    "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.4/build/index.module.js",
  ],
  [
    "external/bvh-LICENSE",
    "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.4/LICENSE",
  ],
  [
    "external/draco_encoder.js",
    "https://cdn.jsdelivr.net/gh/google/draco@1.5.7/javascript/draco_encoder.js",
  ],
  [
    "external/draco-LICENSE",
    "https://cdn.jsdelivr.net/gh/google/draco@1.5.7/LICENSE",
  ],
];
for (const [path, url] of dependencies) await fetchFile(path, url);
function importSpecifiers(source) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(node.type) &&
      typeof node.source?.value === "string"
    )
      found.push(node.source.value);
    for (const value of Object.values(node))
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
  }
  visit(parseAst(source));
  return found;
}
const scanned = new Set();
const external = new Set();
while (true) {
  const pending = [...records.keys()].filter(
    (path) =>
      path.endsWith(".js") &&
      !/editor\/js\/libs\/(acorn|codemirror|ternjs|esprima|jsonlint|signals)/.test(
        path,
      ) &&
      !scanned.has(path),
  );
  if (!pending.length) break;
  const needed = new Set();
  for (const path of pending) {
    scanned.add(path);
    const source = await readFile(new URL(path, root), "utf8");
    for (const specifier of importSpecifiers(source)) {
      let dependency;
      if (specifier.startsWith(".") && !specifier.endsWith(".js")) continue;
      if (specifier.startsWith("."))
        dependency = posix.normalize(
          posix.join(posix.dirname(path), specifier),
        );
      else if (specifier.startsWith("three/addons/"))
        dependency = specifier.replace("three/addons/", "examples/jsm/");
      else if (specifier.startsWith("three/examples/"))
        dependency = specifier.replace("three/examples/", "examples/");
      else if (
        ![
          "three",
          "three/webgpu",
          "three/tsl",
          "three-gpu-pathtracer",
          "three-mesh-bvh",
        ].includes(specifier)
      ) {
        external.add(specifier);
        continue;
      }
      if (dependency && !records.has(dependency)) {
        if (!blobs.has(dependency))
          throw new Error(`Missing import ${path} -> ${dependency}`);
        needed.add(dependency);
      }
    }
  }
  await batch([...needed]);
}
await writeFile(
  new URL("../resource-manifest.json", root),
  JSON.stringify(
    {
      commit,
      threeRevision: 186,
      dependencyPins: {
        "three-gpu-pathtracer": "0.0.23",
        "three-mesh-bvh": "0.7.4",
        draco: "1.5.7",
      },
      unresolvedBareImports: [...external].sort(),
      files: [...records.values()].sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    files: records.size,
    bytes: [...records.values()].reduce((sum, item) => sum + item.bytes, 0),
    unresolvedBareImports: [...external],
  }),
);
