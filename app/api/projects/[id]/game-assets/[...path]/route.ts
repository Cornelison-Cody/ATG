import { getProject } from "@/lib/projects";
import { requireProjectRuntimeAccess } from "@/lib/project-access";
import { readGameAsset } from "@/lib/project-game";

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

  const authResponse = await requireProjectRuntimeAccess(request, project);
  if (authResponse) {
    return authResponse;
  }

  try {
    const asset = await readGameAsset(project, assetSegments);
    const isHtml = asset.contentType.startsWith("text/html");
    const body = isHtml
      ? injectAtgSdk(asset.content.toString("utf8"))
      : new Uint8Array(asset.content);

    return new Response(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": asset.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Game asset was not found.";
    const status = "status" in Object(error) && typeof Object(error).status === "number" ? Object(error).status : 404;
    return Response.json({ error: message }, { status });
  }
}

function injectAtgSdk(html: string) {
  const script = `<script>
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

  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }

  return `${script}${html}`;
}
