import { createAtgEngineBridge } from "./atg-engine-bridge.mjs";

const LOGICAL_HEIGHT = 1080;
const LOGICAL_WIDTH = 1920;
const MAX_FPS = 30;

const runtimeVersion = new URL(import.meta.url).pathname.split("/").at(-2);
const api = {
  app: null,
  destroy: () => {},
  logicalSize: { height: LOGICAL_HEIGHT, width: LOGICAL_WIDTH },
  PIXI: null,
  ready: null,
  bridge: null,
  stage: null
};

window.ATGEngine = api;
api.ready = mountRuntime(api);
api.ready.catch(() => undefined);

async function mountRuntime(target) {
  await waitForDocument();
  const surface = createSurface();
  const status = createStatus(surface);
  let app = null;
  let observer = null;
  let destroyed = false;
  let canvas = null;

  function releaseRenderer() {
    observer?.disconnect();
    observer = null;
    if (app) {
      app.ticker.stop();
      app.destroy({ children: true, removeView: true, texture: true, textureSource: true });
      app = null;
    }
    target.app = null;
    target.bridge?.destroy();
    target.bridge = null;
    target.stage = null;
    target.PIXI = null;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    canvas?.removeEventListener("webglcontextlost", handleContextLost);
    window.removeEventListener("error", handleRuntimeError);
    window.removeEventListener("unhandledrejection", handleRuntimeRejection);
    window.removeEventListener("pagehide", destroy);
    releaseRenderer();
    surface.remove();
  }

  function showRuntimeFailure(message) {
    releaseRenderer();
    if (!status.isConnected) {
      surface.append(status);
    }
    showFailure(status, message, () => {
      destroy();
      api.ready = mountRuntime(api);
      api.ready.catch(() => undefined);
    });
  }

  function handleContextLost(event) {
    event.preventDefault();
    showRuntimeFailure("The graphics context was lost.");
  }

  function handleRuntimeError() {
    showRuntimeFailure("ATG encountered a game engine error.");
  }

  function handleRuntimeRejection(event) {
    event.preventDefault();
    showRuntimeFailure("ATG encountered a game engine error.");
  }

  target.destroy = destroy;
  window.addEventListener("pagehide", destroy, { once: true });

  try {
    status.textContent = "Loading game engine...";
    if (!hasWebGl()) {
      throw new RendererUnavailableError("WebGL is unavailable in this browser or display.");
    }

    const PIXI = await import(`/api/engine/${encodeURIComponent(runtimeVersion)}/pixi.min.mjs`);
    app = new PIXI.Application();
    await app.init({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      height: LOGICAL_HEIGHT,
      preference: "webgl",
      resolution: 1,
      width: LOGICAL_WIDTH
    });
    app.ticker.maxFPS = MAX_FPS;
    canvas = app.canvas;
    canvas.setAttribute("aria-label", "ATG game canvas");
    canvas.setAttribute("role", "img");
    canvas.addEventListener("webglcontextlost", handleContextLost);
    surface.append(canvas);

    observer = new ResizeObserver(() => sizeCanvas(canvas, surface));
    observer.observe(surface);
    sizeCanvas(canvas, surface);

    target.app = app;
    target.bridge = createAtgEngineBridge(window.ATG);
    target.PIXI = PIXI;
    target.stage = app.stage;
    target.createSceneScope = target.bridge.createSceneScope;
    status.remove();
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleRuntimeRejection);
    window.dispatchEvent(new CustomEvent("atg-engine-ready", { detail: target }));
    return target;
  } catch (error) {
    const message = error instanceof RendererUnavailableError
      ? error.message
      : "ATG could not start this game engine.";
    showRuntimeFailure(message);
    window.dispatchEvent(new CustomEvent("atg-engine-error", { detail: { error, message } }));
    throw error;
  }
}

function createSurface() {
  const surface = document.createElement("div");
  surface.setAttribute("data-atg-engine-stage", "");
  Object.assign(surface.style, {
    alignItems: "center",
    background: "#07111f",
    display: "flex",
    height: "100vh",
    inset: "0",
    justifyContent: "center",
    overflow: "hidden",
    position: "fixed",
    width: "100vw",
    zIndex: "2147483646"
  });
  document.body.append(surface);
  return surface;
}

function createStatus(surface) {
  const status = document.createElement("div");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("role", "status");
  Object.assign(status.style, {
    color: "#eef5ff",
    fontFamily: "system-ui, sans-serif",
    fontSize: "18px",
    maxWidth: "34rem",
    padding: "24px",
    textAlign: "center"
  });
  surface.append(status);
  return status;
}

function hasWebGl() {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

function showFailure(status, message, retry) {
  status.replaceChildren();
  status.setAttribute("role", "alert");
  const text = document.createElement("p");
  text.textContent = `${message} Try a current browser with hardware acceleration enabled.`;
  const button = document.createElement("button");
  button.textContent = "Retry";
  button.type = "button";
  Object.assign(button.style, {
    background: "#4dd6c9",
    border: "0",
    borderRadius: "4px",
    color: "#04110f",
    cursor: "pointer",
    font: "inherit",
    fontWeight: "700",
    marginTop: "12px",
    padding: "10px 16px"
  });
  button.addEventListener("click", retry, { once: true });
  status.append(text, button);
}

function sizeCanvas(canvas, surface) {
  const { height, width } = surface.getBoundingClientRect();
  const scale = Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT);
  canvas.style.height = `${Math.max(1, Math.floor(LOGICAL_HEIGHT * scale))}px`;
  canvas.style.width = `${Math.max(1, Math.floor(LOGICAL_WIDTH * scale))}px`;
}

function waitForDocument() {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

class RendererUnavailableError extends Error {}
