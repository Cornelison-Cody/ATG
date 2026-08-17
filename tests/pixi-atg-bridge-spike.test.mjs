import assert from "node:assert/strict";
import test from "node:test";
import { Container, Graphics } from "pixi.js";
import { createPixiAtgBridgeSpike } from "../spikes/pixi-atg-bridge.mjs";

test("ATG state and actions cross the PixiJS spike boundary", () => {
  const listeners = new Set();
  const sentActions = [];
  let currentState = { actions: [], players: [] };
  const atg = {
    onState(listener) {
      listeners.add(listener);
      listener(currentState);
      return () => listeners.delete(listener);
    },
    sendAction(actionType, payload) {
      sentActions.push({ actionType, payload });
    }
  };

  const spike = createPixiAtgBridgeSpike(atg);

  assert.ok(spike.stage instanceof Container);
  assert.ok(spike.stateSignal instanceof Graphics);
  assert.equal(spike.stage.children[0], spike.stateSignal);
  assert.equal(spike.stateSignal.tint, 0x8290a6);
  assert.equal(spike.stateSignal.alpha, 0.55);

  currentState = {
    actions: [{ actionType: "answer" }, { actionType: "score" }],
    players: [
      { connected: true, id: "player-1" },
      { connected: true, id: "player-2" },
      { connected: false, id: "player-3" }
    ]
  };
  for (const listener of listeners) listener(currentState);

  assert.equal(spike.stateSignal.tint, 0x4dd6c9);
  assert.equal(spike.stateSignal.alpha, 1);
  assert.equal(spike.stateSignal.rotation, 0.08);
  assert.equal(spike.stateSignal.scale.x, 1.1);
  assert.equal(spike.stateSignal.scale.y, 1.1);

  spike.stateSignal.emit("pointertap");
  assert.deepEqual(sentActions, [{
    actionType: "spike:primary",
    payload: { connectedPlayers: 2 }
  }]);

  spike.destroy();
  assert.equal(listeners.size, 0);
  assert.equal(spike.stage.destroyed, true);
});

test("PixiJS spike rejects an incomplete ATG SDK", () => {
  assert.throws(
    () => createPixiAtgBridgeSpike({ onState() {} }),
    /requires onState and sendAction/
  );
});
