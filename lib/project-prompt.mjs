export function buildProjectPrompt(message, editingTarget, engineMetadata) {
  const target = editingTarget === "both"
    ? {
        file: "game/tv.html and game/phone.html",
        name: "Full game plan",
        role: "coordinated TV display and phone controller experience",
        guidance:
          "Implement the requested plan across every affected game file. Update TV, phone, shared state, styling, configuration, and instructions together when the plan calls for coordinated behavior."
      }
    : editingTarget === "phone"
    ? {
        file: "game/phone.html",
        name: "Phone controller",
        role: "phone player controller",
        avoidFile: "game/tv.html",
        guidance:
          "Prioritize game/phone.html for player controls and phone-specific UI. Update shared files only when phone behavior needs shared state, styling, configuration, or instructions."
      }
    : {
        file: "game/tv.html",
        name: "TV display",
        role: "TV display",
        avoidFile: "game/phone.html",
        guidance:
          "Prioritize game/tv.html for the shared display and host-facing TV experience. Update shared files only when TV behavior needs shared state, styling, configuration, or instructions."
      };

  const normalizedEngineMetadata = engineMetadata || { type: "legacy", runtimeVersion: null, formatVersion: 1, migrationStatus: "legacy" };
  const engineGuidance = buildEngineGuidance(normalizedEngineMetadata, editingTarget);

  return `You are working inside one sandboxed Azure Tides Gaming game workspace, not the ATG platform app.

ACTIVE EDITING TARGET: ${target.name}
- Treat the creator's request as targeting the ${target.role}.
- Primary target file: ${target.file}.
- ${target.guidance}
- ${
    editingTarget === "both"
      ? "Edit both game/tv.html and game/phone.html when the plan affects both experiences."
      : `Do not edit ${target.avoidFile} unless the creator explicitly asks for ${editingTarget === "phone" ? "TV display" : "phone controller"} changes too.`
  }
- Shared files may be edited when needed for this target: game/styles.css, game/game.js, game/config.json, and game/instructions.md.
- Keep game/instructions.md in sync with gameplay changes. When you add or change rules, setup, player actions, scoring, win conditions, controls, or assets, update game/instructions.md in the same edit.
- Always design player and host actions with immediate feedback. When adding or changing controls, submissions, votes, buzzes, timers, score changes, round transitions, errors, or win/loss moments, include clear feedback such as button states, visual confirmation, animation, sound when appropriate, status text, celebratory results, or recovery messaging.
- Make feedback visible on the surface where the action happens and, when relevant, reflected on the other surface too. Phone actions should confirm on the phone and update the TV; TV/host actions should make the shared game state obvious to players.
- Respect accessibility and comfort: do not rely on sound, color, animation, or vibration alone; keep motion brief and honor prefers-reduced-motion in CSS when adding animations.

Game engine metadata from game/config.json:
${JSON.stringify(normalizedEngineMetadata)}
- This metadata identifies the game's runtime contract. Preserve it unless the creator explicitly asks to change the engine or migrate the game.

Editable game files live under game/: tv.html, phone.html, styles.css, game.js, config.json, and instructions.md. Use game/instructions.md for player-facing game rules, setup, controls, and gameplay instructions. Do not edit the parent ATG platform app unless the user explicitly asks for platform changes. The platform owns QR joining, phone player name/color identity, color selection, WebSocket connection, connection state, menus, player roster plumbing, and the TV Back to Editor control. Use the injected window.ATG SDK from project HTML/JS for custom TV and phone interactions. Use window.ATG.sendAction(actionType, payload) for event-based gameplay and window.ATG.setState(statePatch) when the game needs to synchronize shared custom state across the TV and phones. Platform-owned state fields cannot be replaced.

${engineGuidance}

User request:
${message}`;
}

function buildEngineGuidance(engineMetadata, editingTarget) {
  if (engineMetadata?.type !== "pixi") {
    return `LEGACY GAME CONTRACT
- Keep the existing HTML/CSS/JavaScript rendering architecture and file layout.
- Do not add PixiJS, engine runtime imports, CDN scripts, or engine-only metadata to a legacy game.
- Preserve the legacy TV/phone ownership boundaries and use the injected window.ATG SDK for shared state and actions.`;
  }

  const targetGuidance = editingTarget === "phone"
    ? "Phone edits must remain accessible DOM controls. Do not render phone controls through PixiJS or move phone interaction into the TV scene."
    : editingTarget === "both"
      ? "Coordinate the Pixi TV scene and DOM phone controls through window.ATG actions/state while keeping each surface's ownership boundary."
      : "TV edits must render through the pinned ATG Pixi runtime. Do not fall back to ad hoc TV DOM or Canvas rendering.";

  return `ENGINE-BACKED GAME CONTRACT
- Runtime: ${engineMetadata.runtimeVersion}; formatVersion: ${engineMetadata.formatVersion}; migrationStatus: ${engineMetadata.migrationStatus}. Preserve these values exactly.
- TV rendering uses window.ATGEngine after its ready promise resolves. Use engine.PIXI, engine.stage, and engine.gameplay; do not import PixiJS from a package, CDN, or another runtime URL.
- Build scene content with engine.gameplay.createScene or transitionTo. Put reusable scene modules in game/scenes/*.js or game/scenes/*.mjs and dispose scene-owned resources through the scene lifecycle.
- Use scene.tween, scene.after/every, scene.createParticlePool, scene.audio, and scene.scope for animation, timers, particles, audio, and ATG subscriptions. Never leave ticker callbacks, timers, tweens, particle pools, subscriptions, or audio resources alive after a scene is disposed.
- Read shared state with engine.bridge.onState and send intent with engine.bridge.sendAction. Use engine.bridge.setState only for custom state; never replace platform-owned players, actions, config, projectId, prompt, or buzzes fields.
- Load project assets through the approved game asset paths and manifests. Reuse existing assets and metadata; do not create binary files in the Codex workspace, use public CDNs, or add unapproved dependencies.
- Keep a loading state, renderer/runtime error recovery, responsive logical 1920x1080 scaling, accessible feedback, and prefers-reduced-motion behavior. Keep scenes within the 4K/30 FPS budgets: avoid unnecessary filters, draw calls, particles, changing text, and native 4K backing buffers.
- Pair important visual/gameplay changes with equivalent player feedback, including audio through engine.audio where appropriate; never rely on sound or color alone.
- ${targetGuidance}`;
}
