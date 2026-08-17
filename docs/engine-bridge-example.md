# ATG engine bridge example

This example shows a phone action becoming shared ATG state and immediate TV canvas feedback. Phone controls stay DOM-based; only the TV uses the PixiJS runtime.

## Phone controller

```js
document.querySelector("#celebrate").addEventListener("click", () => {
  window.ATG.sendAction("celebrate", { emoji: "star" });
});
```

## TV scene

```js
await window.ATGEngine.ready;

const { PIXI, bridge, stage } = window.ATGEngine;
const scene = bridge.createSceneScope();
const feedback = new PIXI.Text({
  style: { fill: "#4dd6c9", fontSize: 72 },
  text: "Waiting for a player..."
});
feedback.anchor.set(0.5);
feedback.position.set(960, 540);
stage.addChild(feedback);

scene.onAction((action) => {
  if (action.actionType === "celebrate") {
    feedback.text = "Player celebration received";
    feedback.scale.set(1.15);
  }
});

window.addEventListener("pagehide", () => {
  scene.dispose();
  feedback.destroy();
}, { once: true });
```

`bridge.setState({ round: { celebration: true } })` can synchronize custom game state. Platform-owned fields such as `players`, `actions`, `config`, and `prompt` are removed before a patch reaches `window.ATG.setState`.
