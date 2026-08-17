# ADR 0001: ATG 2D game engine

- Status: Accepted
- Date: 2026-08-16
- Issue: [#137](https://github.com/Cornelison-Cody/ATG/issues/137)
- Parent roadmap: [#126](https://github.com/Cornelison-Cody/ATG/issues/126)

## Context

ATG games currently render with project-owned HTML, CSS, and JavaScript inside the TV and phone shells. This keeps projects simple, but it makes polished animation, sprites, effects, sound, and predictable rendering performance difficult for AI-generated games.

ATG already owns multiplayer state, WebSocket transport, player identity, phone joining, shell navigation, menus, and the editor preview. The rendering stack should improve the game surface without creating a second source of truth for those platform responsibilities.

The agreed product constraints are:

- The engine is for 2D animated characters, sprites, and visual game objects. 3D is out of scope.
- The TV uses the engine. Phone controllers remain DOM-based for accessibility, battery life, and dependable form controls.
- The initial target is at least 30 FPS on a representative laptop driving a 4K TV.
- Engine libraries are hosted by ATG, versioned, and pinned per project. Public CDNs are not runtime dependencies.
- WebGL is the production renderer. WebGPU can be evaluated later after browser behavior is sufficiently consistent.

## Options considered

### PixiJS 8 with an ATG gameplay layer

PixiJS provides a focused 2D scene graph, WebGL and WebGPU renderers, asset loading, a ticker, pointer events, accessibility support, filters, and high-performance particle primitives. It does not impose multiplayer state, scene ownership, physics, or game rules.

This is a strong fit for ATG because the platform can add only the lifecycle and gameplay APIs it needs while retaining ownership of networking and shared state.

### Phaser 4

Phaser is a comprehensive game framework with its own game instance, scene manager, loader, input, sound, cameras, animation, particles, tweens, and physics. Those features make it productive for standalone games, but several overlap with lifecycle and state boundaries ATG already owns.

Using Phaser would reduce some framework work, but it would also make generated games more likely to create competing state, scene, input, and audio lifecycles. Its broader API also increases the surface that prompts, migrations, and runtime upgrades must keep compatible.

### Continue with DOM and ad hoc Canvas

This preserves the smallest dependency footprint but does not address the original performance, animation, asset, sound, and consistency problems. It also asks generated code to recreate rendering and lifecycle patterns for every game.

## Decision

ATG will use PixiJS 8 as the rendering foundation for engine-backed TV games and provide a thin, versioned ATG gameplay layer above it.

The technical spike pins PixiJS 8.19.0 as a development dependency. Issue #139 will package and serve the production runtime from immutable, same-origin URLs. Each project will pin an ATG runtime version rather than importing PixiJS directly from a CDN.

### Runtime boundaries

- The ATG shell continues to own players, connections, shared state transport, actions, configuration, menus, and room plumbing.
- The engine adapter subscribes to `window.ATG.onState` and sends intent through `window.ATG.sendAction` and `window.ATG.setState`.
- Engine scenes render shared TV state. They do not open sockets or replace platform-owned state fields.
- Phone game files remain HTML, CSS, and JavaScript rendered as DOM controls.
- The initial stage uses a 1920 by 1080 logical coordinate system and scales to the available TV surface. Native 4K backing buffers are not the default.
- The ticker is capped at 30 FPS initially. Gameplay uses elapsed time rather than frame counts.

### Renderer and browser behavior

- Prefer the PixiJS WebGL renderer for production. WebGPU is deferred because PixiJS still describes it as experimental for production use.
- Support current evergreen Chrome, Edge, Firefox, and Safari releases that provide a working WebGL context.
- Feature-detect renderer creation at startup. If WebGL is unavailable or initialization fails, show an ATG-owned unsupported-renderer message with recovery guidance.
- Do not silently fall back to DOM rendering or maintain a separate Canvas renderer implementation. Legacy projects continue to use their existing renderer until upgraded.
- Handle WebGL context loss, resize, teardown, and asset failures in the ATG runtime rather than in each generated game.

### Companion choices

- Audio: use `@pixi/sound` behind an ATG audio manager. Version selection and browser audio-unlock behavior belong to #144.
- Tweening: use Tween.js behind ATG animation helpers. It integrates with an existing ticker and avoids inventing interpolation and easing behavior. Version selection belongs to #143.
- Particles: use PixiJS v8 `ParticleContainer` and `Particle` behind ATG helpers. Do not adopt `@pixi/particle-emitter` because its current peer range does not support PixiJS 8.
- Scenes: implement a small ATG-owned scene lifecycle so scene transitions clean up subscriptions, tweens, particles, textures, and audio consistently.
- Physics: do not include a physics engine in the initial stack. Add one only when concrete game requirements justify the runtime and prompt complexity.

## Technical spike

`spikes/pixi-atg-bridge.mjs` is deliberately not a production runtime. It proves two integration points using real PixiJS scene objects:

1. ATG state subscriptions update a PixiJS `Graphics` object in a scene graph.
2. A PixiJS pointer event sends a game action through the ATG SDK boundary.

`tests/pixi-atg-bridge-spike.test.mjs` runs the proof headlessly and verifies subscription cleanup. Production renderer initialization, asset loading, scaling, diagnostics, audio, and scene management remain in their roadmap issues.

## Consequences

### Benefits

- ATG gains GPU-accelerated 2D rendering without surrendering multiplayer and shell ownership.
- The generated-game API can remain smaller and more stable than raw Phaser or raw PixiJS usage.
- Phone accessibility and interaction patterns stay DOM-native.
- Pinned ATG runtime versions isolate creator projects from dependency churn.

### Costs and risks

- ATG must build and maintain a scene lifecycle and gameplay primitives in #143.
- PixiJS has no production Canvas fallback in v8, so unsupported WebGL environments need an explicit error experience in #141.
- PixiJS particle APIs are marked experimental. Wrapping them behind ATG APIs limits migration impact.
- The abstraction can become too broad. New APIs should be added only from demonstrated game needs and covered by examples and prompt evaluations.
- A 4K output can create excessive GPU work if backing resolution is not capped. #145 must establish representative budgets and regression fixtures.
- AI-generated code may bypass the architecture unless prompts, examples, file validation, and evaluations in #148 through #152 reinforce it.

## Follow-up work

- #138 defines engine and format metadata.
- #139 hosts immutable engine bundles.
- #140 documents engine release and rollback procedures.
- #141 implements the production TV bootstrap and renderer failure behavior.
- #142 implements the production ATG bridge.
- #143 adds scene, tween, timer, transition, and particle primitives.
- #144 implements the audio manager.
- #145 establishes 4K and 30 FPS budgets.
- #146 adds editor-only diagnostics.

## Primary references

- [PixiJS architecture](https://pixijs.com/8.x/guides/concepts/architecture)
- [PixiJS renderers](https://pixijs.com/8.x/guides/components/renderers)
- [PixiJS events](https://pixijs.com/8.x/guides/components/events)
- [PixiJS performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [PixiJS particle container](https://pixijs.com/8.x/guides/components/scene-objects/particle-container)
- [Phaser scenes](https://docs.phaser.io/phaser/concepts/scenes)
- [Phaser audio](https://docs.phaser.io/phaser/concepts/audio)
- [Tween.js guide](https://tweenjs.github.io/tween.js/docs/user_guide.html)
