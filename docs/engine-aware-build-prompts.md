# Engine-aware build prompts

Build prompts branch on the normalized `game/config.json` engine metadata. Legacy games receive their existing HTML/CSS/JavaScript contract and are explicitly told not to add PixiJS or engine imports. Engine-backed games receive the pinned runtime, format, and migration status plus the ATG scene, bridge, audio, asset, cleanup, accessibility, and performance contracts.

The prompt keeps target ownership explicit:

- TV work renders through `window.ATGEngine` and its Pixi scene lifecycle.
- Phone work remains accessible DOM controls.
- Full-game work coordinates both surfaces through `window.ATG` state and actions.

Engine guidance requires `engine.gameplay` scene helpers, `engine.bridge` state/action APIs, approved project asset paths, pinned same-origin runtime bundles, loading/error feedback, cleanup of scene-owned resources, and the 4K/30 FPS budgets. It prohibits CDN imports, unapproved dependencies, binary files in the Codex text workspace, and ad hoc TV DOM/Canvas fallbacks.
