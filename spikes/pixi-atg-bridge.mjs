import { Container, Graphics } from "pixi.js";

const ACTIVE_TINT = 0x4dd6c9;
const IDLE_TINT = 0x8290a6;

export function createPixiAtgBridgeSpike(atg) {
  if (!atg || typeof atg.onState !== "function" || typeof atg.sendAction !== "function") {
    throw new TypeError("The Pixi ATG spike requires onState and sendAction SDK methods.");
  }

  const stage = new Container({ label: "atg-bridge-spike" });
  const stateSignal = new Graphics({ label: "state-signal" })
    .roundRect(0, 0, 160, 64, 12)
    .fill(0xffffff);

  stateSignal.eventMode = "static";
  stateSignal.cursor = "pointer";
  stage.addChild(stateSignal);

  let connectedPlayers = 0;
  let destroyed = false;

  const renderState = (state = {}) => {
    if (destroyed) return;

    const players = Array.isArray(state.players) ? state.players : [];
    const actions = Array.isArray(state.actions) ? state.actions : [];
    connectedPlayers = players.filter((player) => player?.connected).length;

    stateSignal.tint = connectedPlayers > 0 ? ACTIVE_TINT : IDLE_TINT;
    stateSignal.alpha = connectedPlayers > 0 ? 1 : 0.55;
    stateSignal.rotation = Math.min(actions.length, 4) * 0.04;
    stateSignal.scale.set(1 + Math.min(connectedPlayers, 4) * 0.05);
  };

  const sendPrimaryAction = () => {
    atg.sendAction("spike:primary", { connectedPlayers });
  };

  stateSignal.on("pointertap", sendPrimaryAction);
  const unsubscribe = atg.onState(renderState);

  return {
    stage,
    stateSignal,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stateSignal.off("pointertap", sendPrimaryAction);
      if (typeof unsubscribe === "function") unsubscribe();
      stage.destroy({ children: true });
    }
  };
}
