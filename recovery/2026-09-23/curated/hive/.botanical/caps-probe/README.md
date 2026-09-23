# Caps compatibility probe

This ignored probe used the maintained packed Caps/Stipe runtimes and a tiny
Vite page. It did not edit Botanical-next or Hive tracked source.

## Provenance

- Source package: `/home/levi/src/Botanical-next/packages/caps`, package
  `@fungi.computer/caps@0.0.0`, packed with native `pnpm pack --pack-destination`
  on 2026-09-07. Tarball SHA-256:
  `eac6ac2f5acf15a7d26448e300be1641c10e9fe003471f03406efe35c1caf670`.
- Source package: `/home/levi/src/Botanical-next/packages/stipe`, package
  `@fungi.computer/stipe@0.0.0`, packed by the same native command. Tarball
  SHA-256: `8b984b698ee4d982cbb6da4909ae5af9e31b27fc70f013dcd440379a2cd1a977`.
- The Caps tarball's packed `package.json` shows the workspace dependency
  rewritten natively from `workspace:*` to `@fungi.computer/stipe: 0.0.0`.
- Built source hashes used by the tarballs: Caps Button
  `35b91fe71ff11f5e10d8397823db7aff309499c0ebff75fce35d3fa63c6febf6`, Caps
  Checkbox `531ad80c5da612b8acb9b5ef98bfd3c33fb1d5a9bfb5c55a77813bf4da9c06be`,
  Caps `dist/styles.css`
  `2670d60e45c7328098368dca3f4d1117cc738ea1139cdc9e43668f1172c3a023`, and
  Stipe `dist/styles.css`
  `73f748ca19c8ffcfbbb9201ba3e57b15c438c0ec7f00263d4ba26c75703c54b0`.

## Probe steps and result

1. Ran native `pnpm pack` in the Caps and Stipe package directories, writing
   only into this ignored directory.
2. Installed the two tarballs plus `react@18.3.1`, `react-dom@18.3.1`, and
   `vite@7.0.0` with `npm install --ignore-scripts --no-package-lock`.
3. Rendered explicit subpath imports for
   `@fungi.computer/caps/components/button`,
   `@fungi.computer/caps/components/checkbox`,
   `@fungi.computer/stipe/styles.css`, and
   `@fungi.computer/caps/styles.css`.
4. Ran the browser page through the existing scope guard:

   ```text
   bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
     env CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
     LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu \
     bash /home/levi/src/hive/.botanical/caps-probe/run-browser.sh
   ```

The guarded browser result was:

```json
{"title":"Caps compatibility probe","buttonClass":"btn transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:border-base-300 disabled:bg-base-200 disabled:text-base-content disabled:outline-1 disabled:outline-dashed disabled:outline-base-content aria-disabled:border-base-300 aria-disabled:bg-base-200 aria-disabled:text-base-content aria-disabled:outline-1 aria-disabled:outline-dashed aria-disabled:outline-base-content btn-primary btn-md","checkboxChecked":true,"buttonBackground":"rgb(249, 130, 132)"}
```

The actual packed runtime rendered both controls and stylesheet classes. Enter
and Space activated the enabled Button twice, Checkbox received native focus,
and Space toggled it. The focus check used `locator.focus()`; it did not
exercise the Button's forwarded ref through a real joined-game focus return.
The disabled probe had no handler, so its lack of activation did not prove
disabled nonactivation or state preservation. The joined-game proof must attach
a real handler, click a live Caps control, and verify focus/activation behavior
there. This is enough evidence that Caps primitives can render in a React
18.3.1 browser host when Stipe/Caps styles are installed, but not enough for
those caller focus claims.

## Compatibility conclusion

Pinning the host to React 18.3.1 satisfies the declared Caps peer, and Hive now
consumes the verified packed dependencies through their explicit subpaths. The
probe alone does not establish Hive's joined-game focus or disabled-action
claims; those require the caller proof described above. No peer override,
replacement component, registry publication, or hosted deployment is justified
by this probe.
