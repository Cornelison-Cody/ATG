import assert from "node:assert/strict";
import test from "node:test";
import { createAtgEngineBridge, normalizeStatePatch } from "../engine-bundles/atg-tv-runtime-1.1.0/atg-engine-bridge.mjs";

function createAtgFixture(initialState = {}) {
  const listeners = new Set();
  const actions = [];
  const patches = [];
  const configs = [];
  let state = initialState;

  return {
    actions,
    atg: {
      getState: () => state,
      onState(listener) {
        listeners.add(listener);
        listener(state);
        return () => listeners.delete(listener);
      },
      sendAction(actionType, payload) {
        actions.push({ actionType, payload });
      },
      setConfig(config) {
        configs.push(config);
      },
      setState(patch) {
        patches.push(patch);
      }
    },
    configs,
    emit(nextState) {
      state = nextState;
      for (const listener of [...listeners]) listener(state);
    },
    listeners,
    patches
  };
}

test("engine bridge shares one ATG subscription and scene scopes clean it up", () => {
  const fixture = createAtgFixture({ actions: [], config: { title: "Bridge" }, players: [] });
  const bridge = createAtgEngineBridge(fixture.atg);
  const first = bridge.createSceneScope();
  const second = bridge.createSceneScope();
  const snapshots = [];
  const actions = [];

  first.onState((state) => snapshots.push(state.players.length));
  second.onAction((action) => actions.push(action.actionType));
  assert.equal(fixture.listeners.size, 1);
  assert.equal(bridge.getConfig().title, "Bridge");

  fixture.emit({
    actions: [{ actionType: "celebrate", createdAt: "2026-08-17T00:00:00.000Z", payload: { emoji: "star" } }],
    config: { title: "Bridge" },
    players: [{ id: "player-1" }]
  });
  assert.deepEqual(snapshots, [0, 1]);
  assert.deepEqual(actions, ["celebrate"]);

  first.dispose();
  assert.equal(fixture.listeners.size, 1);
  second.dispose();
  assert.equal(fixture.listeners.size, 0);
  bridge.destroy();
});

test("engine bridge sends actions and protects platform-owned state fields", () => {
  const fixture = createAtgFixture();
  const bridge = createAtgEngineBridge(fixture.atg);

  bridge.sendAction("celebrate", { emoji: "star" });
  assert.deepEqual(fixture.actions, [{ actionType: "celebrate", payload: { emoji: "star" } }]);

  assert.deepEqual(bridge.setState({
    actions: ["forged"],
    config: { title: "forged" },
    customRound: { celebration: true },
    players: ["forged"],
    prompt: "forged"
  }), { customRound: { celebration: true } });
  assert.deepEqual(fixture.patches, [{ customRound: { celebration: true } }]);

  bridge.setConfig({ accentColor: "#4dd6c9" });
  assert.deepEqual(fixture.configs, [{ accentColor: "#4dd6c9" }]);
});

test("engine bridge validates lifecycle inputs and rejects use after teardown", () => {
  const fixture = createAtgFixture();
  const bridge = createAtgEngineBridge(fixture.atg);

  assert.throws(() => bridge.onState(null), /must be a function/);
  assert.throws(() => bridge.sendAction(""), /non-empty string/);
  assert.throws(() => normalizeStatePatch([]), /must be an object/);
  bridge.destroy();
  assert.throws(() => bridge.createSceneScope(), /has been destroyed/);
});
