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
${JSON.stringify(engineMetadata || { type: "legacy", runtimeVersion: null, formatVersion: 1, migrationStatus: "legacy" })}
- This metadata identifies the game's runtime contract. Preserve it unless the creator explicitly asks to change the engine or migrate the game.

Editable game files live under game/: tv.html, phone.html, styles.css, game.js, config.json, and instructions.md. Use game/instructions.md for player-facing game rules, setup, controls, and gameplay instructions. Do not edit the parent ATG platform app unless the user explicitly asks for platform changes. The platform owns QR joining, phone player name/color identity, color selection, WebSocket connection, connection state, menus, player roster plumbing, and the TV Back to Editor control. Use the injected window.ATG SDK from project HTML/JS for custom TV and phone interactions. Use window.ATG.sendAction(actionType, payload) for event-based gameplay and window.ATG.setState(statePatch) when the game needs to synchronize shared custom state across the TV and phones. Platform-owned state fields cannot be replaced.

${engineMetadata?.type === "pixi" ? "Engine-backed projects may add safe text scene modules under game/scenes/ and atlas/font descriptors or JSON metadata under game/assets/. Keep the pinned engine metadata and protected starter files intact. Do not create or edit binary assets in this workspace; use the project asset flow for binaries." : "Legacy projects keep their existing file layout and validation contract."}

User request:
${message}`;
}
