import assert from "node:assert/strict";
import test from "node:test";
import { createAtgGameplay } from "../engine-bundles/atg-tv-runtime-1.2.0/atg-gameplay.mjs";

function createFixture() {
  const tickerCallbacks = new Set();
  const bridgeScopes = new Set();
  class Container {
    constructor() {
      this.children = [];
      this.destroyed = false;
      this.scale = { set: () => {}, x: 1, y: 1 };
      this.x = 0;
      this.y = 0;
    }
    addChild(child) { this.children.push(child); }
    destroy() { this.destroyed = true; this.children = []; }
  }
  class Sprite extends Container {
    constructor(texture) { super(); this.texture = texture; this.visible = false; this.alpha = 1; }
  }
  const app = {
    stage: new Container(),
    ticker: {
      add(callback) { tickerCallbacks.add(callback); },
      remove(callback) { tickerCallbacks.delete(callback); }
    }
  };
  const bridge = {
    createSceneScope() {
      const scope = { disposed: false, dispose() { scope.disposed = true; bridgeScopes.delete(scope); } };
      bridgeScopes.add(scope);
      return scope;
    }
  };
  return { app, bridge, bridgeScopes, PIXI: { Container, ParticleContainer: Container, Sprite }, tickerCallbacks };
}

test("gameplay transitions release scene-owned timers, particles, and bridge scopes", async () => {
  const fixture = createFixture();
  const gameplay = createAtgGameplay(fixture);
  const events = [];
  const first = await gameplay.transitionTo({
    id: "setup",
    enter(scene) {
      scene.every(10, () => events.push("timer"));
      const pool = scene.createParticlePool({ texture: {} });
      pool.emit({ life: 10, velocityX: 10 });
    },
    exit() { events.push("exit"); }
  });
  gameplay.tick(10);
  assert.equal(first.root.destroyed, false);
  assert.deepEqual(events, ["timer"]);

  const second = await gameplay.transitionTo({ id: "active-round" });
  assert.equal(first.root.destroyed, true);
  assert.equal(fixture.bridgeScopes.size, 1);
  assert.equal(gameplay.currentScene, second);
  const results = await gameplay.transitionTo({ id: "results" });
  const winner = await gameplay.transitionTo({ id: "winner" });
  assert.equal(second.root.destroyed, true);
  assert.equal(results.root.destroyed, true);
  assert.equal(gameplay.currentScene, winner);
  gameplay.destroy();
  assert.equal(winner.root.destroyed, true);
  assert.equal(fixture.tickerCallbacks.size, 0);
});

test("gameplay timers, tweens, and particle pools use elapsed time", () => {
  const fixture = createFixture();
  const gameplay = createAtgGameplay(fixture);
  const scene = gameplay.createScene({});
  let calls = 0;
  scene.after(50, () => calls += 1);
  const target = { value: 0 };
  scene.tween(target, { value: 10 }, { duration: 100 });
  const pool = scene.createParticlePool({ maxParticles: 1, texture: {} });
  const particle = pool.emit({ life: 50, velocityX: 20 });
  assert.ok(particle);
  assert.equal(pool.emit(), null);
  gameplay.tick(50);
  assert.equal(calls, 1);
  assert.equal(pool.activeCount, 0);
  assert.ok(target.value > 0 && target.value < 10);
  gameplay.tick(50);
  assert.equal(target.value, 10);
  gameplay.destroy();
});
