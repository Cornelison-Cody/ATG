import { randomBytes } from "crypto";
import { getAtgEngineBundle, getAtgEngineCompatibilityError, getAtgEngineBundleUrl } from "@/lib/atg-engine-bundles.mjs";
import { getProject } from "@/lib/projects";
import { readGameAsset, readGameConfig } from "@/lib/project-game";
import { readConversionPreviewAsset } from "@/lib/conversion-manager.mjs";
import { getRuntimeUpgradeForProject } from "@/lib/runtime-upgrade-manager.mjs";
import { canEditProject, getProjectPrincipal, principalRequiredResponse } from "@/lib/project-access";
import { requireEditorAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; path: string[] }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id, path: assetSegments } = await context.params;
  const project = await getProject(id);

  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const conversionId = params.get("conversion");
    const conversionRevision = params.get("revision");
    const runtimeUpgradeId = params.get("runtimeUpgrade");
    let asset;
    let previewEngine = null;
    if (conversionId || conversionRevision || runtimeUpgradeId) {
      const authResponse = await requireEditorAuth(request);
      if (authResponse) return authResponse;
      const principal = getProjectPrincipal(request);
      if (!principal) return principalRequiredResponse();
      if (!canEditProject(project, principal)) {
        return Response.json({ error: "You do not have permission to preview this conversion." }, { status: 403 });
      }
      if (runtimeUpgradeId) {
        if (!conversionRevision) return Response.json({ error: "A runtime upgrade preview requires a revision." }, { status: 400 });
        const upgrade = await getRuntimeUpgradeForProject(project.id, runtimeUpgradeId);
        if (upgrade.status !== "preview" || upgrade.previewRevision !== conversionRevision) return Response.json({ error: "Runtime upgrade preview is no longer available." }, { status: 404 });
        asset = await readGameAsset(project, assetSegments);
        previewEngine = upgrade.currentMetadata && { ...upgrade.currentMetadata, runtimeVersion: upgrade.candidate.runtimeVersion };
      } else if (!conversionId || !conversionRevision) {
        return Response.json({ error: "A conversion preview requires both conversion and revision." }, { status: 400 });
      } else {
        const preview = await readConversionPreviewAsset(project.id, conversionId, conversionRevision, assetSegments.join("/"));
        asset = preview;
        previewEngine = preview.engine;
      }
    } else {
      asset = await readGameAsset(project, assetSegments);
    }
    const isHtml = asset.contentType.startsWith("text/html");
    const engine = isHtml && isTvGameAsset(assetSegments)
      ? (previewEngine || (await readGameConfig(project)).engine)
      : null;
    const nonce = engine?.type === "pixi" ? randomBytes(18).toString("base64") : "";
    const body = isHtml
      ? injectAtgSdk(asset.content.toString("utf8"), engine, nonce, request.url)
      : new Uint8Array(asset.content);

    return new Response(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": asset.contentType,
        ...(engine?.type === "pixi" ? { "Content-Security-Policy": gameEngineCsp(nonce) } : {}),
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Game asset was not found.";
    const status = "status" in Object(error) && typeof Object(error).status === "number" ? Object(error).status : 404;
    return Response.json({ error: message }, { status });
  }
}

function injectAtgSdk(
  html: string,
  engine: Awaited<ReturnType<typeof readGameConfig>>["engine"] | null,
  nonce: string,
  requestUrl: string
) {
  const script = `<script${nonce ? ` nonce="${nonce}"` : ""}>
(() => {
  const listeners = new Set();
  let currentState = {};

  window.ATG = {
    getState() {
      return currentState;
    },
    onState(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }
      listeners.add(callback);
      callback(currentState);
      return () => listeners.delete(callback);
    },
    sendAction(actionType, payload = {}) {
      window.parent.postMessage({ source: "atg-game", type: "gameAction", actionType, payload }, "*");
    },
    setState(state) {
      window.parent.postMessage({ source: "atg-game", type: "setState", state }, "*");
    },
    setConfig(config) {
      window.parent.postMessage({ source: "atg-game", type: "setConfig", config }, "*");
    }
  };

  window.showAtgEngineCompatibilityError = (message) => {
    const render = () => {
      const surface = document.createElement("div");
      surface.setAttribute("role", "alert");
      surface.textContent = message;
      Object.assign(surface.style, {
        alignItems: "center",
        background: "#07111f",
        color: "#eef5ff",
        display: "flex",
        font: "600 18px system-ui, sans-serif",
        inset: "0",
        justifyContent: "center",
        padding: "24px",
        position: "fixed",
        textAlign: "center",
        zIndex: "2147483646"
      });
      document.body.append(surface);
    };
    if (document.body) {
      render();
    } else {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    }
  };

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== "atg-shell" || message.type !== "state") {
      return;
    }
    currentState = message.state || {};
    for (const listener of [...listeners]) {
      listener(currentState);
    }
  });

  window.parent.postMessage({ source: "atg-game", type: "ready" }, "*");
})();
</script>`;
  const engineScript = engine?.type === "pixi"
    ? engineBootstrapScript(engine, nonce)
    : "";
  const diagnosticsScript = engine?.type === "pixi" && new URL(requestUrl).searchParams.has("atgEditorPreview")
    ? engineDiagnosticsScript(nonce)
    : "";

  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}${engineScript}${diagnosticsScript}</head>`);
  }

  return `${script}${engineScript}${diagnosticsScript}${html}`;
}

function engineDiagnosticsScript(nonce: string) {
  return `<script nonce="${nonce}">
(() => {
  const FRAME_BUDGET_MS = 1000 / 30;
  const frameTimes = [];
  let frameCount = 0;
  let droppedFrames = 0;
  let windowStarted = performance.now();
  let ticker = null;
  let tickerCallback = null;
  let samplerOverheadMs = 0;
  let assetFailures = 0;
  let audioFailures = 0;
  let engineErrors = 0;
  let lastError = "";
  let reportTimer = 0;

  const post = (status, engine) => {
    const now = performance.now();
    const elapsed = Math.max(1, now - windowStarted);
    const sorted = [...frameTimes].sort((left, right) => left - right);
    const percentile = (rank) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * rank) - 1)] || 0;
    const averageFrameTime = frameTimes.length
      ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
      : 0;
    const p95FrameTime = percentile(0.95);
    const warnings = [];
    if (p95FrameTime > FRAME_BUDGET_MS) warnings.push("Pixi ticker p95 frame time is above the 30 FPS budget; reduce particles, filters, or changing text.");
    if (droppedFrames > 0) warnings.push("Pixi dropped frames during this sample; reduce work in the heaviest scene or preload assets.");
    if (samplerOverheadMs / elapsed > 0.01) warnings.push("Diagnostics overhead exceeded 1% of the sample window; shorten the sample buffer or disable optional diagnostics.");
    if (assetFailures > 0) warnings.push("One or more assets failed to load; check the asset path, format, and project asset library.");
    if (audioFailures > 0) warnings.push("Audio failed in the preview; check the sound asset and browser audio unlock state.");
    if (engineErrors > 0) warnings.push("The engine reported an error; inspect the game code and runtime compatibility.");
    window.parent.postMessage({
      source: "atg-game",
      type: "engineDiagnostics",
      payload: {
        status,
        fps: frameCount * 1000 / elapsed,
        frameTimeMs: averageFrameTime,
        p50FrameTimeMs: percentile(0.5),
        p95FrameTimeMs: p95FrameTime,
        worstFrameTimeMs: sorted[sorted.length - 1] || 0,
        droppedFrames,
        tickerFps: frameCount * 1000 / elapsed,
        samplerOverheadMs,
        renderer: engine?.app?.renderer?.type || engine?.app?.renderer?.constructor?.name || "WebGL",
        resolution: engine?.app?.renderer?.resolution || 1,
        logicalSize: engine?.logicalSize || null,
        assetFailures,
        audioFailures,
        engineErrors,
        lastError,
        warnings
      }
    }, "*");
    frameCount = 0;
    frameTimes.length = 0;
    droppedFrames = 0;
    samplerOverheadMs = 0;
    windowStarted = now;
  };
  const onTicker = (tickerState) => {
    const started = performance.now();
    const frameTime = Number(tickerState?.deltaMS || tickerState?.elapsedMS || 0);
    if (frameTime > 0) {
      frameTimes.push(Math.min(1000, frameTime));
      if (frameTimes.length > 120) frameTimes.shift();
      if (frameTime > FRAME_BUDGET_MS) droppedFrames += Math.max(1, Math.round(frameTime / FRAME_BUDGET_MS) - 1);
    }
    frameCount += 1;
    samplerOverheadMs += performance.now() - started;
  };
  const classifyError = (message) => {
    const text = String(message || "");
    lastError = text.slice(0, 180);
    if (/asset|texture|image|font|load/i.test(text)) assetFailures += 1;
    else engineErrors += 1;
  };
  window.addEventListener("error", (event) => classifyError(event.message));
  window.addEventListener("unhandledrejection", (event) => classifyError(event.reason));
  window.addEventListener("atg-audio-error", (event) => {
    audioFailures += 1;
    lastError = String(event.detail?.message || "Audio error").slice(0, 180);
  });
  window.addEventListener("atg-engine-error", (event) => {
    engineErrors += 1;
    lastError = String(event.detail?.message || "Engine error").slice(0, 180);
  });
  window.addEventListener("pagehide", () => {
    if (ticker && tickerCallback) ticker.remove(tickerCallback);
    window.clearInterval(reportTimer);
  }, { once: true });
  window.addEventListener("atg-engine-ready", (event) => {
    const engine = event.detail || window.ATGEngine;
    ticker = engine?.app?.ticker || null;
    tickerCallback = onTicker;
    ticker?.add(tickerCallback);
    post("ready", engine);
    reportTimer = window.setInterval(() => post("sample", engine), 1000);
  }, { once: true });
})();
</script>`;
}

function engineBootstrapScript(engine: Awaited<ReturnType<typeof readGameConfig>>["engine"], nonce: string) {
  const bundle = getAtgEngineBundle(engine.runtimeVersion, "atg-tv-runtime.mjs");
  if (!bundle) {
    return `<script nonce="${nonce}">window.showAtgEngineCompatibilityError(${JSON.stringify(getAtgEngineCompatibilityError(engine.runtimeVersion))});</script>`;
  }

  const runtimeUrl = getAtgEngineBundleUrl(engine.runtimeVersion, "atg-tv-runtime.mjs");
  return `<script type="module" src="${runtimeUrl}" integrity="${bundle.integrity}" crossorigin="anonymous"></script><script nonce="${nonce}">(() => {
  const engineScript = document.currentScript.previousElementSibling;
  const showFailure = () => {
    if (!window.ATGEngine) window.showAtgEngineCompatibilityError("ATG could not load this game engine. Check the runtime version and retry.");
  };
  engineScript.addEventListener("error", showFailure, { once: true });
  window.setTimeout(showFailure, 10000);
})();</script>`;
}

function gameEngineCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "base-uri 'none'",
    "object-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "connect-src 'self'",
    "worker-src 'self' blob:"
  ].join("; ");
}

function isTvGameAsset(assetSegments: string[]) {
  return assetSegments.length === 1 && assetSegments[0] === "tv.html";
}
