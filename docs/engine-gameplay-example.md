# ATG gameplay primitives example

The gameplay layer is available after the ATG TV runtime becomes ready. It owns scene cleanup, elapsed-time timers and tween updates, and pooled Pixi particles. TV games should use it instead of registering unmanaged Pixi ticker callbacks or leaving ATG state listeners active after a scene transition.

```js
await window.ATGEngine.ready;

const { gameplay, PIXI } = window.ATGEngine;

const setup = {
  id: "setup",
  enter(scene) {
    const title = new PIXI.Text({ text: "Join the game", style: { fill: "white", fontSize: 72 } });
    scene.root.addChild(title);
    scene.scope.onState((state) => {
      title.text = `${state.players?.length || 0} players ready`;
    });
  }
};

const activeRound = {
  id: "active-round",
  enter(scene) {
    scene.after(30_000, () => gameplay.transitionTo(results));
  }
};

const results = {
  id: "results",
  enter(scene) {
    scene.after(4_000, () => gameplay.transitionTo(winner));
  }
};

const winner = {
  id: "winner",
  enter(scene) {
    const message = new PIXI.Text({ text: "Winner!", style: { fill: "#4dd6c9", fontSize: 96 } });
    scene.root.addChild(message);
    scene.pulse(message);
  }
};

await gameplay.transitionTo(setup);
```

`transitionTo` disposes the preceding scene after its optional `exit` hook. Disposal cancels the scene's timers and tweens, releases particle pools, removes its root container, and disposes its ATG bridge scope. Effects such as `pulse` and `shake` suppress motion when the viewer prefers reduced motion; provide equivalent text, color, or layout feedback for any meaningful state change.
