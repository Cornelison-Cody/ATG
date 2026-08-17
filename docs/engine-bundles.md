# ATG engine bundles

ATG serves game-engine libraries from same-origin, versioned URLs. Games must never import their engine runtime or approved companion libraries from a public CDN.

## Current runtime releases

| ATG runtime | Bundle URL | Library | Integrity | License |
| --- | --- | --- | --- | --- |
| `atg-2d-1.0.0` | `/api/engine/atg-2d-1.0.0/pixi.min.mjs` | `pixi.js` 8.19.0 | `sha384-xfbAeTbJR9wkgBgr3TUzVjX99MxVMJNZQ8gkusM6vzhyeHmjWlx75GwwgaENHGAh` | MIT, `engine-bundles/pixi-8.19.0/LICENSE` |
| `atg-2d-1.0.1` | `/api/engine/atg-2d-1.0.1/pixi.min.mjs` | `pixi.js` 8.19.0 | `sha384-xfbAeTbJR9wkgBgr3TUzVjX99MxVMJNZQ8gkusM6vzhyeHmjWlx75GwwgaENHGAh` | MIT, `engine-bundles/pixi-8.19.0/LICENSE` |
| `atg-2d-1.1.0` | `/api/engine/atg-2d-1.1.0/atg-tv-runtime.mjs` | ATG TV runtime 1.1.0 with `pixi.js` 8.19.0 | `sha384-UIJDMMHeNBBT52VS/SJ/ISQg+kDyHf6ACovvEw3O3Unx67eD9sBo/UYOVejX/SJZ` | ATG-owned runtime; PixiJS remains MIT |

The two releases intentionally share the same PixiJS payload while the ATG gameplay layer is still being introduced. They remain separately addressable so an ATG runtime update can be added without changing games already pinned to an earlier release.

## Delivery contract

- Engine modules are served only at `/api/engine/<runtime-version>/<bundle>`.
- A valid bundle response uses `Cache-Control: public, max-age=31536000, immutable` and includes its SHA-384 integrity value in `X-ATG-Engine-Integrity`.
- Bundle responses allow anonymous module loading from ATG's sandboxed game iframes. They are public, immutable code assets and contain no project data.
- Unknown runtime or bundle requests return a JSON `404` compatibility error; missing deployed artifacts return a JSON `503` error. The TV bootstrap in #141 will render these as an ATG-owned recovery experience.
- The engine URL and integrity string come from `lib/atg-engine-bundles.mjs`; generated games must not invent URLs or integrity values.
- A runtime release is append-only. Do not replace or delete a vendored bundle while any project is pinned to its runtime version.

## CSP and integrity

Engine-backed game iframes will use a same-origin-only `script-src` policy. The production bootstrap must load the registered URL with its matching SRI `integrity` value and use a nonce for the ATG-owned bridge script. It must not enable public CDN origins, `unsafe-eval`, or broad script host allowlists. The bootstrap and iframe CSP enforcement are delivered in #141; this issue establishes the registry values it consumes.

## Provenance

The vendored `pixi.min.mjs` file comes from the `dist/pixi.min.mjs` artifact in the `pixi.js` 8.19.0 npm package, installed from the repository lockfile. Its optional Basis and KTX transcoder defaults are rewritten to the same-origin `/api/engine/pixi-8.19.0/*` copies, which are vendored alongside the artifact. Its MIT license is copied alongside the artifact. The manifest integrity value is a SHA-384 digest of the resulting deployed module.
