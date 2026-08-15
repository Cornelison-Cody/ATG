export function buildProjectPrompt(message, editingTarget) {
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

Editable game files live under game/: tv.html, phone.html, styles.css, game.js, config.json, and instructions.md. Use game/instructions.md for player-facing game rules, setup, controls, and gameplay instructions. Do not edit the parent ATG platform app unless the user explicitly asks for platform changes. The platform owns QR joining, phone player name/color identity, color selection, WebSocket connection, connection state, menus, player roster plumbing, and the TV Back to Editor control. Use the injected window.ATG SDK from project HTML/JS for custom TV and phone interactions. Use window.ATG.sendAction(actionType, payload) for event-based gameplay and window.ATG.setState(statePatch) when the game needs to synchronize shared custom state across the TV and phones. Platform-owned state fields cannot be replaced.

User request:
${message}`;
}
