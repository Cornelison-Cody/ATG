import { Group, Tween, Easing } from "./tween.esm.mjs";

const DEFAULT_MAX_PARTICLES = 128;

export function createAtgGameplay({ app, audio = null, bridge, PIXI }) {
  if (!app?.ticker || !app?.stage || !bridge || !PIXI) {
    throw new TypeError("ATG gameplay requires an initialized Pixi application and ATG bridge.");
  }

  const tweenGroup = new Group();
  const scenes = new Set();
  const mediaQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let currentScene = null;
  let elapsed = 0;
  let destroyed = false;

  const ticker = (tickerState) => {
    const deltaMS = Number.isFinite(tickerState?.deltaMS) ? tickerState.deltaMS : 1000 / 30;
    tick(deltaMS);
  };
  app.ticker.add(ticker);

  function tick(deltaMS) {
    if (destroyed) return;
    elapsed += Math.max(0, deltaMS);
    tweenGroup.update(elapsed);
    for (const scene of [...scenes]) scene.tick(deltaMS);
  }

  async function transitionTo(definition, data) {
    assertActive();
    validateSceneDefinition(definition);
    const previous = currentScene;
    if (previous) await previous.dispose();
    const next = createScene(definition);
    currentScene = next;
    try {
      await next.enter(data);
      return next;
    } catch (error) {
      await next.dispose();
      throw error;
    }
  }

  function createScene(definition = {}) {
    assertActive();
    validateSceneDefinition(definition);
    const root = new PIXI.Container();
    const scope = bridge.createSceneScope();
    const audioScope = audio?.createSceneScope();
    const timers = new Set();
    const tweens = new Set();
    const pools = new Set();
    let active = true;
    let entered = false;

    app.stage.addChild(root);

    const scene = {
      id: definition.id || "scene",
      root,
      scope,
      audio: audioScope,
      get active() {
        return active;
      },
      get reducedMotion() {
        return Boolean(mediaQuery?.matches);
      },
      after(delay, callback) {
        return addTimer(delay, callback, false);
      },
      every(interval, callback) {
        return addTimer(interval, callback, true);
      },
      tween(target, to, options = {}) {
        assertSceneActive();
        const duration = effectiveDuration(options.duration ?? 300, scene.reducedMotion, options.reduceMotion !== false);
        const tween = new Tween(target, tweenGroup)
          .to(to, duration)
          .easing(options.easing || Easing.Quadratic.Out)
          .onComplete(() => tweens.delete(tween))
          .onStop(() => tweens.delete(tween));
        if (typeof options.onComplete === "function") tween.onComplete(options.onComplete);
        tween.start(elapsed);
        tweens.add(tween);
        return tween;
      },
      pulse(target, options = {}) {
        const scale = target.scale;
        if (!scale) throw new TypeError("ATG gameplay pulse target must have a Pixi scale.");
        const amount = Number.isFinite(options.amount) ? options.amount : 0.12;
        const baseX = scale.x;
        const baseY = scale.y;
        if (scene.reducedMotion && options.reduceMotion !== false) return null;
        return scene.tween(scale, { x: baseX * (1 + amount), y: baseY * (1 + amount) }, {
          duration: options.duration ?? 140,
          easing: Easing.Quadratic.Out,
          onComplete: () => scene.tween(scale, { x: baseX, y: baseY }, { duration: options.duration ?? 140 })
        });
      },
      shake(target, options = {}) {
        if (scene.reducedMotion && options.reduceMotion !== false) return null;
        const distance = Number.isFinite(options.distance) ? options.distance : 14;
        const x = target.x;
        const y = target.y;
        return scene.tween(target, { x: x + distance, y }, {
          duration: options.duration ?? 90,
          onComplete: () => scene.tween(target, { x, y }, { duration: options.duration ?? 90 })
        });
      },
      createParticlePool(options = {}) {
        assertSceneActive();
        const pool = createParticlePool({ PIXI, parent: root, ...options });
        pools.add(pool);
        return pool;
      },
      async enter(data) {
        assertSceneActive();
        if (entered) return;
        entered = true;
        if (typeof definition.enter === "function") await definition.enter(scene, data);
      },
      async dispose() {
        if (!active) return;
        active = false;
        if (currentScene === scene) currentScene = null;
        let exitResult;
        try {
          if (entered && typeof definition.exit === "function") exitResult = definition.exit(scene);
        } finally {
          for (const timer of timers) timer.cancel();
          for (const tween of tweens) tween.stop();
          for (const pool of pools) pool.destroy();
          timers.clear();
          tweens.clear();
          pools.clear();
          scope.dispose();
          audioScope?.dispose();
          root.destroy({ children: true });
          scenes.delete(scene);
        }
        await exitResult;
      },
      tick(deltaMS) {
        if (!active) return;
        for (const timer of [...timers]) timer.tick(deltaMS);
        for (const pool of pools) pool.tick(deltaMS);
        definition.update?.(scene, deltaMS);
      }
    };

    function assertSceneActive() {
      if (!active) throw new Error("ATG gameplay scene has been disposed.");
    }

    function addTimer(interval, callback, repeating) {
      assertSceneActive();
      if (!Number.isFinite(interval) || interval < 0 || typeof callback !== "function") {
        throw new TypeError("ATG gameplay timers require a non-negative interval and callback.");
      }
      let remaining = interval;
      let cancelled = false;
      const timer = {
        cancel() {
          cancelled = true;
          timers.delete(timer);
        },
        tick(deltaMS) {
          if (cancelled) return;
          remaining -= deltaMS;
          while (!cancelled && remaining <= 0) {
            callback();
            if (!repeating) return timer.cancel();
            remaining += interval || 1;
          }
        }
      };
      timers.add(timer);
      return timer;
    }

    scenes.add(scene);
    return scene;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    app.ticker.remove(ticker);
    for (const scene of [...scenes]) scene.dispose();
    tweenGroup.removeAll();
    scenes.clear();
    currentScene = null;
  }

  function assertActive() {
    if (destroyed) throw new Error("ATG gameplay has been destroyed.");
  }

  return { createScene, destroy, get currentScene() { return currentScene; }, tick, transitionTo };
}

export function createParticlePool({ PIXI, parent, texture, maxParticles = DEFAULT_MAX_PARTICLES }) {
  if (!parent || !texture || !Number.isInteger(maxParticles) || maxParticles < 1) {
    throw new TypeError("ATG particle pools require a parent, texture, and positive maxParticles.");
  }
  const container = PIXI.ParticleContainer ? new PIXI.ParticleContainer() : new PIXI.Container();
  const available = [];
  const active = new Set();
  let destroyed = false;
  parent.addChild(container);

  for (let index = 0; index < maxParticles; index += 1) {
    const particle = new PIXI.Sprite(texture);
    particle.visible = false;
    container.addChild(particle);
    available.push(particle);
  }

  function emit(options = {}) {
    if (destroyed) throw new Error("ATG particle pool has been destroyed.");
    const particle = available.pop();
    if (!particle) return null;
    particle.alpha = options.alpha ?? 1;
    particle.rotation = options.rotation ?? 0;
    particle.scale.set(options.scale ?? 1);
    particle.x = options.x ?? 0;
    particle.y = options.y ?? 0;
    particle.visible = true;
    const entry = {
      gravityY: options.gravityY ?? 0,
      life: Math.max(0, options.life ?? 500),
      particle,
      velocityX: options.velocityX ?? 0,
      velocityY: options.velocityY ?? 0
    };
    active.add(entry);
    return particle;
  }

  function tick(deltaMS) {
    for (const entry of [...active]) {
      entry.life -= deltaMS;
      entry.velocityY += entry.gravityY * (deltaMS / 1000);
      entry.particle.x += entry.velocityX * (deltaMS / 1000);
      entry.particle.y += entry.velocityY * (deltaMS / 1000);
      if (entry.life <= 0) release(entry);
    }
  }

  function release(entry) {
    active.delete(entry);
    entry.particle.visible = false;
    available.push(entry.particle);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    active.clear();
    available.length = 0;
    container.destroy({ children: true });
  }

  return { destroy, emit, get activeCount() { return active.size; }, tick };
}

function effectiveDuration(duration, reducedMotion, shouldReduce) {
  if (!Number.isFinite(duration) || duration < 0) throw new TypeError("ATG gameplay tween duration must be non-negative.");
  return reducedMotion && shouldReduce ? 0 : duration;
}

function validateSceneDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("ATG gameplay scene definition must be an object.");
  }
}
