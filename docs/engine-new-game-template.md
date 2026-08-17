# Engine-backed new-game template

New projects use the pinned `atg-2d-1.3.0` runtime and format version `1` by default. The creator does not choose a format: the TV starter is a Pixi scene loaded through the ATG runtime, while the phone starter remains a DOM document with an accessible action button.

The starter demonstrates the required ownership boundary:

- `tv.html` provides the TV document shell; `game.js` creates an ATG gameplay scene and Pixi text objects after `ATGEngine.ready`.
- `phone.html` provides a DOM panel and `game.js` renders a large, keyboard-accessible button that sends an ATG action.
- `config.json` records `type: "pixi"`, `runtimeVersion: "atg-2d-1.3.0"`, `formatVersion: 1`, and `migrationStatus: "upgraded"`.
- The runtime owns WebGL setup, logical scaling, loading/error feedback, audio controls, and cleanup; the starter only owns its scene content.

During rollout, operators can set `ATG_ENGINE_NEW_GAMES_ENABLED=false` (or `0`) to create the existing legacy template. This is an internal fallback and is not exposed as a creator-facing format choice. Existing projects are not rewritten when the flag changes.
