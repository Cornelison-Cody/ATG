import { randomBytes } from "crypto";
import { getAtgEngineBundle, getAtgEngineCompatibilityError, getAtgEngineBundleUrl } from "@/lib/atg-engine-bundles.mjs";
import { getProject } from "@/lib/projects";
import { readGameAsset, readGameConfig } from "@/lib/project-game";

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
    const asset = await readGameAsset(project, assetSegments);
    const isHtml = asset.contentType.startsWith("text/html");
    const engine = isHtml && isTvGameAsset(assetSegments) ? (await readGameConfig(project)).engine : null;
    const nonce = engine?.type === "pixi" ? randomBytes(18).toString("base64") : "";
    const body = isHtml
      ? injectAtgSdk(asset.content.toString("utf8"), engine, nonce)
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

function injectAtgSdk(html: string, engine: Awaited<ReturnType<typeof readGameConfig>>["engine"] | null, nonce: string) {
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

  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}${engineScript}</head>`);
  }

  return `${script}${engineScript}${html}`;
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
