# Engine-backed authoring recipes

These recipes are small references for Codex and maintainers, not production dependencies. Each recipe uses the normal engine-backed project layout (`tv.html`, `phone.html`, `game.js`, `styles.css`, `config.json`, `instructions.md`) and therefore runs in the editor preview, TV route, and phone route. TV visuals use the pinned Pixi runtime; phone controls stay DOM-based.

## Shared recipe contract

Start every TV recipe after the runtime is ready:

```js
await window.ATGEngine.ready;
const { PIXI, bridge, gameplay, stage } = window.ATGEngine;
await gameplay.transitionTo({
  id: "setup",
  enter(scene) {
    const title = new PIXI.Text({ text: "Join the game", style: { fill: "white", fontSize: 64 } });
    scene.root.addChild(title);
    scene.scope.onState((state) => { title.text = `${state.players?.length || 0} players ready`; });
  }
});
```

Use `scene.scope.onState`/`onAction`, `scene.after`/`every`, `scene.tween`, `scene.createParticlePool`, and `scene.audio` so scene transitions dispose subscriptions, timers, tweens, particles, and sounds. A phone recipe sends intent with `window.ATG.sendAction`; the TV reads the resulting action/state through the bridge. Every important sound or color cue also needs visible/text feedback.

## Trivia round

Required gameplay: question, answer submission on the phone, locked answers, scoring, and a results scene. Put question data in a small JSON manifest and render the current question and timer with Pixi text. Use `bridge.onAction` for answer submissions and `bridge.setState({ round, scores })` for custom state. Optional polish is a short transition and a sprite-backed category badge. Keep answer feedback visible on the phone and TV; never reveal the answer through color alone.

Common mistake: letting the phone read or mutate the answer directly without an ATG action, or leaving the countdown timer running after the results transition.

## Buzzer race

Required gameplay: ready state, first valid buzz, lockout, reset, and winner feedback. The phone has a large accessible Buzz button with disabled/loading states and confirmation text. The TV uses a scene scope action listener, a short winner transition, and an audio cue paired with a visible banner. Optional polish is a small particle burst on the winner; cap the pool and dispose it on transition.

Common mistake: relying on local phone timestamps for ordering. The authoritative action order comes from ATG state, and the TV should render the server-provided winner.

## Board path

Required gameplay: a board position, turn ownership, legal move action, and win condition. Render board cells as batched sprites or simple Pixi graphics; keep the phone as a DOM move selector. Use a reusable scene module under `game/scenes/board.mjs`, `scene.tween` for a token move, and `scene.scope.onState` for synchronized turns. Optional polish is a camera/scale transition between board regions.

Common mistake: creating one unmanaged ticker callback per token. Use the gameplay scene lifecycle and elapsed-time helpers instead.

## Action arena

Required gameplay: start/countdown, player intent, cooldown or validity feedback, and round results. Use a sprite animation state machine for the TV character and send player intent from a phone DOM control. Use a bounded particle pool for impacts and `scene.audio.load/play` for one short cue, with visual confirmation for every hit. Keep filters, particles, and changing text within the 4K/30 FPS budgets.

Common mistake: adding a physics package or a second input/socket system. The initial ATG runtime has no physics dependency; keep rules deterministic in shared state.

## Timer challenge

Required gameplay: start, elapsed-time countdown, pause/reset, completion, and timeout feedback. Use `scene.after`/`every` or the scene update lifecycle with elapsed milliseconds; never decrement a counter once per frame. The phone exposes start/pause/reset controls with status text. The TV renders the remaining time and a high-contrast timeout state. Optional polish is a reduced-motion-safe transition at 10 seconds and 3 seconds.

Common mistake: assuming 30 FPS means every frame is exactly 33.33 ms. Use the elapsed time supplied by the gameplay runtime so throttling and frame drops do not change the game rules.

## Team relay

Required gameplay: team assignment, turn ownership, team action, scoring, and final results. Keep team/player identity in ATG state and render a clear TV roster; phone controls should announce the active team and confirm each action. Use scene transitions for setup, relay, and results, plus `bridge.onState` for synchronized scores. Optional polish is a team-colored sprite badge and a short celebration sound with an equivalent visual animation.

Common mistake: storing team membership only in the TV scene. The phone and TV must derive it from shared state, and a reconnect must restore the same team assignment.

## Loading, failure, and performance checklist

All recipes should show the runtime's loading state before the first interactive frame, handle renderer/asset/audio errors with understandable recovery text, and keep uploaded/generated binaries in the project asset flow rather than text edits. Test each recipe in editor preview, `/tv/:projectId`, and `/join/:projectId`; verify phone DOM controls remain usable with keyboard or touch. Use the documented 1920 × 1080 logical stage, 30 FPS cap, reduced-motion behavior, and workload budgets before adding optional polish.
