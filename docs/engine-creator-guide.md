# ATG engine creator guide

This guide explains the engine-backed game workflow without requiring PixiJS knowledge.

## TV and phone responsibilities

The shared TV display uses the pinned ATG engine runtime for scenes, sprites, animation, particles, and audio. Phone controls remain accessible HTML DOM controls. Use clear text, focus states, and status announcements; never rely on color, motion, sound, or vibration alone.

## Upgrade Game and conversion review

Choose **Upgrade Game** from an editable legacy project's game menu. ATG prepares a best-effort conversion without a questionnaire. The current published game stays unchanged while the candidate is reviewed. Test both TV and Phone previews, read blocking errors and warnings, and use **Retry**, **Cancel Upgrade**, or **Accept Upgrade**. Blocking errors prevent acceptance. Warnings require acknowledgment. Acceptance ends the temporary rollback window and creates one new project revision; cancellation restores the legacy game.

## Assets and generated media

Upload supported images, atlas metadata, bitmap fonts, web fonts, compressed audio, and video textures from **Game Assets**. Keep source assets; optimized derivatives are versioned and cacheable. Chat can generate images, characters, sprites, animation sheets, and short sound effects. Preview, retry, or discard generated media before accepting it. Reference art requires explicit consent. Generated music and video are not currently supported.

## Audio and diagnostics

Use the TV audio controls to unlock sound, mute, or adjust volume. Every sound cue needs equivalent visual or text feedback. In an editor preview, diagnostics report runtime, asset, audio, and renderer failures. A missing asset or runtime failure blocks conversion; audio compatibility and software-renderer concerns are warnings.

## Performance and runtime upgrades

Target a logical 1920×1080 stage presented at 4K and 30 FPS. Keep particle counts, filters, draw calls, changing text, and backing-buffer resolution within the benchmark budgets. Existing engine games remain pinned to their runtime. **Runtime Upgrade** previews a newer compatible release; accept only after diagnostics pass and warnings are acknowledged. Cancel leaves the pinned runtime unchanged.

## Troubleshooting

- **Unsupported rendering:** retry in a browser with WebGL enabled; software rendering is a warning to investigate.
- **Missing asset:** verify the asset path and upload the source file again; do not use a public CDN.
- **Audio will not play:** interact with the TV once to unlock audio, then check mute and volume controls.
- **Performance warning:** reduce simultaneous particles, filters, large textures, and per-frame text updates.
- **Conversion failure:** use **Retry** after addressing the reported error. **Cancel Upgrade** restores the unchanged legacy project.

ATG does not collect engine gameplay telemetry during play. Operational signals are limited to editor previews, conversion workflows, and runtime-upgrade workflows.
