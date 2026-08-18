# Editor-only engine diagnostics

The dashboard preview receives a lightweight diagnostics stream for PixiJS TV games. The stream is created only when the game asset request includes `atgEditorPreview=1`; TV and phone play routes do not receive it, and legacy TV games do not load it.

The preview reports:

- measured Pixi ticker FPS plus average/p50/p95/worst ticker frame time against the 30 FPS (33.33 ms) target;
- dropped-frame count and measured diagnostics sampler overhead;
- renderer name, renderer resolution, and the 1920 × 1080 logical stage;
- asset, audio, and engine error counts;
- short warnings with corrective guidance.

The dashboard keeps this data in React state for the active editor session only. It is not sent to the server, stored in project data, or retained after the preview is reloaded. The monitor samples once per second and caps its frame sample buffer. It subscribes to the actual Pixi `app.ticker`; it does not create a second `requestAnimationFrame` loop, so a runtime capped at 30 FPS is reported as approximately 30 FPS. The measured sampler overhead is surfaced when it exceeds 1% of the sample window.

The iframe remains sandboxed. Diagnostics cross the iframe boundary through a namespaced `postMessage` event, and the parent accepts messages only when `event.source` is the active preview iframe. This prevents a game or another window from populating the diagnostics panel.

Warnings are intentionally practical rather than claims of behavioral correctness:

- frame-time warnings suggest reducing particles, filters, or frequently changing text;
- asset warnings point to paths, formats, or the project asset library;
- audio warnings point to the sound asset or browser audio unlock;
- engine warnings point to game code or runtime compatibility.

No production-play telemetry is collected by this feature.
