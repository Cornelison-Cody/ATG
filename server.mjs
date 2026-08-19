import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { normalizeGameStatePatch } from "./lib/game-state-rules.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port, webpack: true });
const handle = app.getRequestHandler();

const rooms = new Map();
const defaultConfig = {
  accentColor: "#4dd6c9",
  buzzLabel: "Buzz",
  initialPrompt: "Tap buzz when you know the answer.",
  promptLabel: "Prompt",
  resetLabel: "Reset Buzzes",
  title: "Buzzer Lobby"
};

await app.prepare();


const server = createServer((request, response) => {
  handle(request, response);
});
const nextUpgradeHandler = app.getUpgradeHandler();

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "", `http://${request.headers.host}`);
  socket.on("error", handleSocketError);

  if (url.pathname !== "/ws/game") {
    nextUpgradeHandler(request, socket, head);
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.on("clientError", (_error, socket) => {
  socket.destroy();
});

wss.on("connection", (ws) => {
  let client = null;

  ws.on("error", handleSocketError);

  ws.on("message", (rawMessage) => {
    const message = parseMessage(rawMessage);
    if (!message) {
      send(ws, { type: "error", message: "Invalid message." });
      return;
    }

    if (message.type === "join") {
      client = handleJoin(ws, message);
      return;
    }

    if (!client) {
      send(ws, { type: "error", message: "Join a project room first." });
      return;
    }

    const room = getRoom(client.projectId);

    if (message.type === "setPrompt" && client.role === "tv") {
      room.prompt = String(message.prompt ?? "").slice(0, 160);
      broadcastRoom(room);
      return;
    }

    if (message.type === "setConfig" && client.role === "tv") {
      room.config = normalizeConfig({ ...room.config, ...message.config });
      broadcastRoom(room);
      return;
    }

    if (message.type === "setState") {
      try {
        room.gameState = {
          ...room.gameState,
          ...normalizeGameStatePatch(message.state)
        };
        broadcastRoom(room);
      } catch (error) {
        send(ws, {
          type: "error",
          message: error instanceof Error ? error.message : "Game state is invalid."
        });
      }
      return;
    }

    if (message.type === "gameAction") {
      const actionType = normalizeActionType(message.actionType);
      if (!actionType) {
        send(ws, { type: "error", message: "Action type is required." });
        return;
      }

      const action = {
        actionType,
        createdAt: new Date().toISOString(),
        payload: sanitizePayload(message.payload),
        ...(client.playerId ? { playerId: client.playerId } : {})
      };
      room.actions.push(action);
      room.actions = room.actions.slice(-40);

      if (actionType === "buzz" && client.role === "player") {
        addBuzz(room, client.playerId);
      } else {
        broadcastRoom(room);
      }
      return;
    }

    if (message.type === "resetBuzzes" && client.role === "tv") {
      room.buzzes = [];
      broadcastRoom(room);
      return;
    }

    if (message.type === "disconnectPlayer" && client.role === "tv") {
      disconnectPlayer(room, String(message.playerId ?? ""));
      return;
    }

    if (message.type === "buzz" && client.role === "player") {
      addBuzz(room, client.playerId);
    }
  });

  ws.on("close", () => {
    if (!client) {
      return;
    }

    const room = getRoom(client.projectId);
    if (client.role === "tv") {
      room.tvClients.delete(ws);
    } else {
      const player = room.players.get(client.playerId);
      if (player) {
        player.connected = false;
      }
      room.playerClients.delete(ws);
    }

    broadcastRoom(room);
  });
});

server.listen(port, hostname, () => {
  console.log(`ATG dev server ready on http://localhost:${port}`);
});

function handleJoin(ws, message) {
  const projectId = String(message.projectId ?? "");
  const role = message.role === "tv" ? "tv" : "player";
  const room = getRoom(projectId);
  if (message.config) {
    room.config = normalizeConfig({ ...room.config, ...message.config });
    room.prompt = room.prompt || room.config.initialPrompt;
  }

  if (role === "tv") {
    room.tvClients.add(ws);
    const client = { projectId, role };
    send(ws, { type: "state", state: serializeRoom(room) });
    return client;
  }

  const playerId = String(message.playerId ?? "");
  const name = normalizeName(message.name);
  const color = normalizeColor(message.color);
  const player = {
    color,
    connected: true,
    id: playerId,
    joinedAt: new Date().toISOString(),
    name
  };

  room.players.set(playerId, player);
  room.playerClients.set(ws, playerId);
  const client = { playerId, projectId, role };
  broadcastRoom(room);
  return client;
}

function getRoom(projectId) {
  if (!rooms.has(projectId)) {
    rooms.set(projectId, {
      buzzes: [],
      actions: [],
      config: defaultConfig,
      gameState: {},
      playerClients: new Map(),
      players: new Map(),
      projectId,
      prompt: defaultConfig.initialPrompt,
      tvClients: new Set()
    });
  }

  return rooms.get(projectId);
}

function broadcastRoom(room) {
  const payload = { type: "state", state: serializeRoom(room) };
  for (const ws of [...room.tvClients, ...room.playerClients.keys()]) {
    send(ws, payload);
  }
}

function serializeRoom(room) {
  return {
    ...room.gameState,
    actions: room.actions,
    buzzes: room.buzzes,
    config: room.config,
    players: [...room.players.values()].map((player) => ({
      color: player.color,
      connected: player.connected,
      id: player.id,
      joinedAt: player.joinedAt,
      name: player.name
    })),
    projectId: room.projectId,
    prompt: room.prompt
  };
}

function addBuzz(room, playerId) {
  const player = room.players.get(playerId);
  const alreadyBuzzed = room.buzzes.some((buzz) => buzz.playerId === playerId);
  if (player && !alreadyBuzzed) {
    room.buzzes.push({
      at: new Date().toISOString(),
      color: player.color,
      name: player.name,
      playerId: player.id
    });
    broadcastRoom(room);
  }
}

function disconnectPlayer(room, playerId) {
  if (!playerId || !room.players.has(playerId)) {
    return;
  }

  for (const [ws, connectedPlayerId] of [...room.playerClients.entries()]) {
    if (connectedPlayerId === playerId) {
      room.playerClients.delete(ws);
      ws.close(4000, "Disconnected by host");
    }
  }

  room.players.delete(playerId);
  room.buzzes = room.buzzes.filter((buzz) => buzz.playerId !== playerId);
  broadcastRoom(room);
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function parseMessage(rawMessage) {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return null;
  }
}

function handleSocketError(error) {
  if (error?.code === "ECONNRESET" || error?.code === "EPIPE") {
    return;
  }

  console.error(error);
}

function normalizeName(value) {
  const name = String(value ?? "").trim();
  return name.slice(0, 32) || "Player";
}

function normalizeColor(value) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#4dd6c9";
}

function normalizeConfig(value) {
  const config = typeof value === "object" && value !== null ? value : {};
  return {
    accentColor: normalizeColor(config.accentColor),
    buzzLabel: normalizeText(config.buzzLabel, defaultConfig.buzzLabel, 40),
    initialPrompt: normalizeText(config.initialPrompt, defaultConfig.initialPrompt, 240),
    promptLabel: normalizeText(config.promptLabel, defaultConfig.promptLabel, 40),
    resetLabel: normalizeText(config.resetLabel, defaultConfig.resetLabel, 40),
    title: normalizeText(config.title, defaultConfig.title, 80)
  };
}

function normalizeText(value, fallback, maxLength) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeActionType(value) {
  const actionType = String(value ?? "").trim();
  return /^[a-z][a-z0-9:_-]{0,48}$/i.test(actionType) ? actionType : "";
}

function sanitizePayload(value) {
  if (value === undefined) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}
