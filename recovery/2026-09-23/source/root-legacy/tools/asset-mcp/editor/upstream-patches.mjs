// Narrow owner changes over pristine pinned upstream bytes. The build/dev server
// applies each exact replacement once and records both input and result hashes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync(new URL("./resource-manifest.json", import.meta.url), "utf8"),
);
const patches = [
  {
    path: "vendor/editor/js/Editor.js",
    edits: [
      [
        "\t\tthis.scene.backgroundIntensity = scene.backgroundIntensity;",
        "\t\tthis.scene.backgroundIntensity = scene.backgroundIntensity;\n\t\tthis.scene.backgroundRotation.copy( scene.backgroundRotation );\n\t\tthis.scene.environmentIntensity = scene.environmentIntensity;\n\t\tthis.scene.environmentRotation.copy( scene.environmentRotation );",
      ],
      [
        "renderer: this.config.getKey( 'project/renderer/type' ),",
        "renderer: this.config.getKey( 'project/renderer/type' ),\n\t\t\t\tantialias: this.config.getKey( 'project/renderer/antialias' ),",
      ],
    ],
  },
  {
    path: "vendor/editor/js/Sidebar.Project.Renderer.js",
    edits: [
      [
        "\tasync function createRenderer() {",
        `\tfunction createRenderer() {

\t\teditor.rendererReady = Promise.resolve( editor.rendererReady ).catch( () => {} ).then( createRendererNow );
\t\treturn editor.rendererReady;

\t}

\tasync function createRendererNow() {`,
      ],
      [
        "\t\tif ( rendererType === 'WebGPURenderer' ) {\n\n\t\t\tcurrentRenderer = new WebGPURenderer( { antialias: antialias, reversedDepthBuffer: true } );\n\t\t\tawait currentRenderer.init();\n\n\t\t} else {\n\n\t\t\tcurrentRenderer = new THREE.WebGLRenderer( { antialias: antialias, reversedDepthBuffer: true } );\n\n\t\t}\n\n\t\tcurrentRenderer.shadowMap.enabled = shadowsBoolean.getValue();\n\t\tcurrentRenderer.shadowMap.type = parseFloat( shadowTypeSelect.getValue() );\n\t\tcurrentRenderer.toneMapping = parseFloat( toneMappingSelect.getValue() );\n\t\tcurrentRenderer.toneMappingExposure = toneMappingExposure.getValue();\n",
        "\t\tlet candidate;\n\t\ttry {\n\t\t\tif ( rendererType === 'WebGPURenderer' ) {\n\t\t\t\tcandidate = new WebGPURenderer( { antialias: antialias, reversedDepthBuffer: true } );\n\t\t\t\tawait candidate.init();\n\t\t\t} else {\n\t\t\t\tcandidate = new THREE.WebGLRenderer( { antialias: antialias, reversedDepthBuffer: true } );\n\t\t\t}\n\t\t\tcandidate.shadowMap.enabled = shadowsBoolean.getValue();\n\t\t\tcandidate.shadowMap.type = parseFloat( shadowTypeSelect.getValue() );\n\t\t\tcandidate.toneMapping = parseFloat( toneMappingSelect.getValue() );\n\t\t\tcandidate.toneMappingExposure = parseFloat( toneMappingExposure.getValue() );\n\t\t} catch ( error ) {\n\t\t\ttry { candidate?.dispose(); } catch { /* Preserve the creation error. */ }\n\t\t\tthrow error;\n\t\t}\n\t\t// Viewport disposes the previously published renderer upon this signal.\n\t\tcurrentRenderer = candidate;\n",
      ],
      [
        "\tcreateRenderer();\n\n\n\t// Signals",
        `\t// Hive: retain the native creation promise and restore through these same
\t// controls, renderer lifecycle and configuration writer.
\teditor.rendererReady = createRenderer();
\teditor.restoreProjectRenderer = async function ( settings ) {

\t\tlet previousFailed = false;
\t\ttry { await editor.rendererReady; } catch { previousFailed = true; }
\t\tconst recreate = previousFailed || rendererTypeSelect.getValue() !== settings.renderer ||
\t\t\tantialiasBoolean.getValue() !== settings.antialias;
\t\trendererTypeSelect.setValue( settings.renderer );
\t\tantialiasBoolean.setValue( settings.antialias );
\t\tshadowsBoolean.setValue( settings.shadows );
\t\tshadowTypeSelect.setValue( settings.shadowType );
\t\ttoneMappingSelect.setValue( settings.toneMapping );
\t\ttoneMappingExposure.setValue( settings.toneMappingExposure );
\t\tif ( recreate ) {
\t\t\teditor.rendererReady = createRenderer();
\t\t\tawait editor.rendererReady;
\t\t}
\t\tupdateShadows();
\t\tupdateToneMapping();

\t};

\t// Signals`,
      ],
    ],
  },
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const patchedPaths = patches.map((patch) => patch.path);
export function patchUpstream(path, bytes) {
  const patch = patches.find((patch) => patch.path === path);
  if (!patch) return { bytes };
  const expected = manifest.files.find(
    (file) => `vendor/${file.path}` === path,
  )?.sha256;
  if (hash(bytes) !== expected)
    throw new Error(`Pristine upstream hash mismatch: ${path}`);
  let source = bytes.toString("utf8");
  for (const [before, after] of patch.edits) {
    if (source.split(before).length !== 2)
      throw new Error(`Pinned upstream patch no longer matches ${path}`);
    source = source.replace(before, after);
  }
  const result = Buffer.from(source);
  return {
    bytes: result,
    record: {
      path,
      pristineSha256: hash(bytes),
      resultSha256: hash(result),
      replacements: patch.edits.length,
    },
  };
}
