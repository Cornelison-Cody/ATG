# ATG engine release playbook

Use this playbook to add an ATG 2D engine runtime. It is written for maintainers and coding agents. A release is append-only: published runtime URLs and vendored files must remain byte-for-byte stable.

## What is versioned

There are two independent version identifiers:

- **Vendor bundle version**: the library payload, such as `pixi-8.20.0`, stored in `engine-bundles/` and exposed at `/api/engine/pixi-8.20.0/<bundle>`.
- **ATG runtime version**: the project pin, such as `atg-2d-1.1.0`, exposed at `/api/engine/atg-2d-1.1.0/pixi.min.mjs`.

An ATG runtime can continue to point to an existing vendor bundle when only ATG-owned behavior changes. A library upgrade requires a new vendor bundle and a new ATG runtime. Never reuse either identifier for different bytes or behavior.

## Preflight

1. Start from an up-to-date, clean `main` checkout. Do not mix an engine release with unrelated application changes.
2. Choose new, unused vendor and ATG runtime versions. Do not edit an existing entry in `lib/atg-engine-bundles.mjs`.
3. Review the dependency release notes, license, browser support, peer dependencies, transcoders, and any approved companion-library compatibility.
4. Decide whether existing games remain pinned or receive an explicit migration. Existing projects must never change engines as a side effect of deployment.

## Prepare the vendor bundle

1. Install the exact library version and update the lockfile:

   ```bash
   npm install --save-dev --save-exact pixi.js@<pixi-version>
   ```

2. Create the new immutable vendor directory and capture all SHA-384 values:

   ```bash
   npm run engine:bundle -- <pixi-version>
   ```

   The script copies the Pixi module, license, Basis/KTX transcoders, and rewrites Pixi's transcoder defaults to same-origin URLs. It refuses to overwrite an existing `engine-bundles/pixi-<pixi-version>` directory.

3. Confirm the generated module does not contain a public CDN fallback:

   ```bash
   rg 'cdn\.jsdelivr\.net' engine-bundles/pixi-<pixi-version>/pixi.min.mjs
   ```

   This command must return no matches.

## Register a runtime

1. In `lib/atg-engine-bundles.mjs`, append the new vendor bundle entries, including content types, relative paths, SHA-384 integrity values emitted by `engine:bundle`, package name, package version, and license path.
2. Append a new `atg-2d-*` runtime entry pointing to its `pixi.min.mjs` vendor bundle. Preserve every older ATG runtime and vendor entry.
3. Update `docs/engine-bundles.md` with the ATG runtime URL, vendor library, integrity value, license, and any companion assets.
4. If an ATG-owned adapter or bootstrap has changed, update its compatibility notes and ensure its supported `runtimeVersion` set includes the new runtime without removing earlier ones.

## Compatibility and retention

- Inventory project `game/config.json` files for `engine.runtimeVersion` before deprecating anything. Local installations can search the data root; Azure installations must inventory Blob-backed game configs.
- Retain every runtime requested by any active, archived, or recoverable project. Keep a released runtime for at least one full production rollback window even when no project currently pins it.
- Deprecation means stopping new-game or migration selection of a version. It does not mean deleting its route, vendored files, registry entry, license, or documentation row.
- A removal requires a dedicated migration and retention issue, a completed project inventory, an explicit maintainer approval, and a tested compatibility fallback. Do not remove runtime assets in a dependency-update pull request.

## Verify before publishing

1. Run repository checks:

   ```bash
   npm run check
   npm run docker:build
   ```

2. With the local server running, verify the registered runtime, an older runtime, and an unknown runtime:

   ```bash
   curl -I http://localhost:3000/api/engine/<new-atg-runtime>/pixi.min.mjs
   curl -I http://localhost:3000/api/engine/<older-atg-runtime>/pixi.min.mjs
   curl -i http://localhost:3000/api/engine/not-a-runtime/pixi.min.mjs
   ```

   Valid assets must return `200`, `Cache-Control: public, max-age=31536000, immutable`, `X-ATG-Engine-Integrity`, and `X-ATG-Engine-Runtime`. The unknown runtime must return the controlled JSON `404` compatibility error.

3. Confirm all SRI values used by the bootstrap come from the registry, and that the iframe CSP keeps script loading same-origin only. Do not add public CDN origins, `unsafe-eval`, or broad script host allowlists.
4. Open a focused PR that references the engine-release issue. Merge only after CI, Docker build, and compatibility review pass. The `main` deployment workflow publishes the container image and deploys it.

## Rollback

1. **New runtime has a defect before games adopt it**: ship a follow-up PR that removes it from new-game or migration choices. Keep its route and assets deployed.
2. **Games were migrated to a defective runtime**: restore their prior `runtimeVersion` only through the migration/rollback tooling; do not edit files in place or delete the defective runtime.
3. **A deployment itself is faulty**: shift Azure Container Apps traffic to the prior known-good revision, then investigate with the newer image still available:

   ```bash
   az containerapp ingress traffic set \
     --name <container-app-name> \
     --resource-group <resource-group> \
     --revision-weight <known-good-revision>=100
   ```

4. Document the incident, preserve the affected bundle and integrity data, and create a new runtime version for the corrected release. Never patch the bytes behind a published immutable URL.
