const RESERVED_STATE_KEYS = new Set([
  "actions",
  "buzzes",
  "config",
  "players",
  "projectId",
  "prompt"
]);

export function createAtgEngineBridge(atg) {
  if (!atg || typeof atg.getState !== "function" || typeof atg.onState !== "function" || typeof atg.sendAction !== "function" || typeof atg.setState !== "function" || typeof atg.setConfig !== "function") {
    throw new TypeError("ATG engine bridge requires the complete window.ATG SDK.");
  }

  const stateListeners = new Set();
  const scopes = new Set();
  let destroyed = false;
  let currentState = atg.getState() || {};
  let unsubscribeFromShell = null;

  function dispatchState(nextState) {
    currentState = nextState && typeof nextState === "object" ? nextState : {};
    for (const listener of [...stateListeners]) {
      listener(currentState);
    }
  }

  function ensureShellSubscription() {
    if (!unsubscribeFromShell && stateListeners.size > 0) {
      unsubscribeFromShell = atg.onState(dispatchState);
    }
  }

  function stopShellSubscription() {
    if (unsubscribeFromShell && stateListeners.size === 0) {
      unsubscribeFromShell();
      unsubscribeFromShell = null;
    }
  }

  function onState(listener) {
    assertActive();
    if (typeof listener !== "function") {
      throw new TypeError("ATG engine state listener must be a function.");
    }
    if (stateListeners.has(listener)) {
      return () => {};
    }

    const hadListeners = stateListeners.size > 0;
    stateListeners.add(listener);
    ensureShellSubscription();
    if (hadListeners) {
      listener(currentState);
    }

    return () => {
      stateListeners.delete(listener);
      stopShellSubscription();
    };
  }

  function onAction(listener) {
    assertActive();
    if (typeof listener !== "function") {
      throw new TypeError("ATG engine action listener must be a function.");
    }

    const seenActions = new Set(actionKeys(currentState.actions));
    return onState((state) => {
      for (const action of Array.isArray(state.actions) ? state.actions : []) {
        const key = actionKey(action);
        if (seenActions.has(key)) continue;
        seenActions.add(key);
        listener(action, state);
      }
      trimSeenActions(seenActions);
    });
  }

  function sendAction(actionType, payload = {}) {
    assertActive();
    if (typeof actionType !== "string" || !actionType.trim()) {
      throw new TypeError("ATG engine action type must be a non-empty string.");
    }
    atg.sendAction(actionType.trim(), payload);
  }

  function setState(patch) {
    assertActive();
    const safePatch = normalizeStatePatch(patch);
    if (Object.keys(safePatch).length > 0) {
      atg.setState(safePatch);
    }
    return safePatch;
  }

  function setConfig(config) {
    assertActive();
    atg.setConfig(config);
  }

  function createSceneScope() {
    assertActive();
    const cleanups = new Set();
    let disposed = false;
    const scope = {
      getConfig: () => getConfig(),
      getState: () => getState(),
      onAction(listener) {
        const cleanup = onAction(listener);
        cleanups.add(cleanup);
        return () => removeCleanup(cleanup);
      },
      onState(listener) {
        const cleanup = onState(listener);
        cleanups.add(cleanup);
        return () => removeCleanup(cleanup);
      },
      sendAction,
      setConfig,
      setState,
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const cleanup of cleanups) cleanup();
        cleanups.clear();
        scopes.delete(scope);
      }
    };

    function removeCleanup(cleanup) {
      cleanup();
      cleanups.delete(cleanup);
    }

    scopes.add(scope);
    return scope;
  }

  function getState() {
    return currentState;
  }

  function getConfig() {
    return currentState.config || {};
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const scope of [...scopes]) scope.dispose();
    stateListeners.clear();
    if (unsubscribeFromShell) unsubscribeFromShell();
    unsubscribeFromShell = null;
  }

  function assertActive() {
    if (destroyed) throw new Error("ATG engine bridge has been destroyed.");
  }

  return { createSceneScope, destroy, getConfig, getState, onAction, onState, sendAction, setConfig, setState };
}

export function normalizeStatePatch(value) {
  if (!isPlainObject(value)) {
    throw new TypeError("ATG engine state patch must be an object.");
  }

  let patch;
  try {
    patch = JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError("ATG engine state patch must be JSON serializable.");
  }
  for (const key of Object.keys(patch)) {
    if (RESERVED_STATE_KEYS.has(key)) delete patch[key];
  }
  return patch;
}

function actionKeys(actions) {
  return (Array.isArray(actions) ? actions : []).map(actionKey);
}

function actionKey(action) {
  if (!action || typeof action !== "object") return JSON.stringify(action);
  return `${action.createdAt || ""}:${action.playerId || ""}:${action.actionType || ""}:${JSON.stringify(action.payload || {})}`;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function trimSeenActions(seenActions) {
  while (seenActions.size > 80) {
    seenActions.delete(seenActions.values().next().value);
  }
}
