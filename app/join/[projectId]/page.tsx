"use client";

import { type CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { DEFAULT_GAME_CONFIG, GameSocketMessage, GameState, JoinInfo } from "@/lib/game-types";
import { InstructionsViewer } from "@/components/instructions-viewer";
import styles from "./join.module.css";

const COLORS = ["#4dd6c9", "#ff6b7a", "#ffd166", "#8ec5ff", "#c792ea", "#95f985"];

const EMPTY_STATE: GameState = {
  actions: [],
  buzzes: [],
  config: DEFAULT_GAME_CONFIG,
  players: [],
  projectId: "",
  prompt: ""
};

type PageParams = Promise<{ projectId: string }>;
type PlayerAccentStyle = CSSProperties & {
  "--accent": string;
  "--accent-strong": string;
  "--join-text-color": string;
};

export default function JoinPage({ params }: { params: PageParams }) {
  const [projectId, setProjectId] = useState("");
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [gameState, setGameState] = useState<GameState>(EMPTY_STATE);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [playerId, setPlayerId] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [connectionState, setConnectionState] = useState("Not joined");
  const [error, setError] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    void Promise.resolve(params).then(({ projectId: nextProjectId }) => setProjectId(nextProjectId));
  }, [params]);

  useEffect(() => {
    const storedId = readStoredValue("atg-player-id") || createPlayerId();
    const storedName = readStoredValue("atg-player-name") || "";
    const storedColor = readStoredValue("atg-player-color") || COLORS[0];
    writeStoredValue("atg-player-id", storedId);
    setPlayerId(storedId);
    setName(storedName);
    setColor(storedColor);
  }, []);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    async function loadJoinInfo() {
      try {
        const response = await fetch(`/api/game/${projectId}/join-info`, { cache: "no-store" });
        const data = (await response.json()) as JoinInfo & { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Unable to load game.");
        }
        setJoinInfo(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load game.");
      }
    }

    void loadJoinInfo();
  }, [projectId]);

  function joinGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!joinInfo || !playerId || !trimmedName) {
      return;
    }

    writeStoredValue("atg-player-name", trimmedName);
    writeStoredValue("atg-player-color", color);
    setHasJoined(true);
    connect(getWebSocketCandidates(joinInfo.wsUrl), trimmedName, color, playerId);
  }

  function changePlayer() {
    socketRef.current?.close();
    socketRef.current = null;
    setConnectionState("Not joined");
    setHasJoined(false);
    setIsMenuOpen(false);
  }

  async function openInstructions() {
    setIsMenuOpen(false);
    setIsInstructionsOpen(true);
    setIsLoadingInstructions(true);
    setError("");

    try {
      const response = await fetch(`/api/game/${projectId}/instructions`, { cache: "no-store" });
      const data = (await response.json()) as { instructions?: string; error?: string };
      if (!response.ok || typeof data.instructions !== "string") {
        throw new Error(data.error || "Unable to load instructions.");
      }
      setInstructions(data.instructions);
    } catch (instructionsError) {
      setError(instructionsError instanceof Error ? instructionsError.message : "Unable to load instructions.");
      setIsInstructionsOpen(false);
    } finally {
      setIsLoadingInstructions(false);
    }
  }

  function connect(
    wsUrls: string[],
    playerName: string,
    playerColor: string,
    nextPlayerId: string,
    attempt = 0
  ) {
    socketRef.current?.close();
    setConnectionState("Connecting");

    const wsUrl = wsUrls[attempt] ?? wsUrls[0];
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    let opened = false;

    socket.addEventListener("open", () => {
      opened = true;
      setConnectionState("Live");
      socket.send(
        JSON.stringify({
          color: playerColor,
          config: joinInfo?.config,
          name: playerName,
          playerId: nextPlayerId,
          projectId,
          role: "player",
          type: "join"
        })
      );
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as GameSocketMessage;
      if (message.type === "state") {
        setGameState(message.state);
      } else {
        setError(message.message);
      }
    });

    socket.addEventListener("close", () => {
      if (!opened && attempt + 1 < wsUrls.length) {
        connect(wsUrls, playerName, playerColor, nextPlayerId, attempt + 1);
        return;
      }
      setConnectionState(opened ? "Disconnected" : "Unable to connect");
    });
  }

  useEffect(() => {
    postStateToGameFrame();
  }, [connectionState, gameState, hasJoined, joinInfo, playerId]);

  useEffect(() => {
    function handleGameMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const message = event.data as {
        actionType?: unknown;
        payload?: unknown;
        source?: unknown;
        type?: unknown;
      };
      if (message?.source !== "atg-game") {
        return;
      }

      if (message.type === "ready") {
        postStateToGameFrame();
        return;
      }

      if (message.type === "gameAction" && typeof message.actionType === "string") {
        socketRef.current?.send(
          JSON.stringify({
            actionType: message.actionType,
            payload: message.payload ?? {},
            type: "gameAction"
          })
        );
      }
    }

    window.addEventListener("message", handleGameMessage);
    return () => window.removeEventListener("message", handleGameMessage);
  }, [gameState, joinInfo, playerId]);

  function postStateToGameFrame() {
    const player = gameState.players.find((item) => item.id === playerId) ?? {
      color,
      connected: connectionState === "Live",
      id: playerId,
      joinedAt: "",
      name
    };

    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "atg-shell",
        state: {
          ...gameState,
          config: gameState.config ?? joinInfo?.config ?? DEFAULT_GAME_CONFIG,
          connectionState,
          player,
          project: joinInfo?.project ?? null,
          role: "player"
        },
        type: "state"
      },
      "*"
    );
  }

  if (error) {
    return <main className={styles.shell}>{error}</main>;
  }

  if (hasJoined) {
    return (
      <main className={styles.phoneShell} style={getPlayerAccentStyle(color)}>
        <header className={styles.phoneHeader}>
          <h1>{joinInfo?.project.name ?? "Game"}</h1>
          <div className={styles.headerActions}>
            <button
              aria-expanded={isMenuOpen}
              aria-label="Open player menu"
              className={styles.menuButton}
              onClick={() => setIsMenuOpen((current) => !current)}
              type="button"
            >
              <Menu aria-hidden="true" />
            </button>
            {isMenuOpen ? (
              <div className={styles.menu} role="menu">
                <div className={styles.playerSummary}>
                  <span style={{ background: color }} />
                  <div>
                    <strong>{name}</strong>
                    <p>{connectionState}</p>
                  </div>
                </div>
                <button onClick={changePlayer} role="menuitem" type="button">
                  Change Player
                </button>
                <button onClick={openInstructions} role="menuitem" type="button">
                  Instructions
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className={styles.controllerFrame} aria-label="Game controller area">
          <iframe
            onLoad={postStateToGameFrame}
            ref={iframeRef}
            sandbox="allow-scripts"
            src={projectId ? `/api/projects/${projectId}/game-assets/phone.html` : undefined}
            title="Project phone game interface"
          />
        </section>

        {isInstructionsOpen ? (
          <div className={styles.modalOverlay} role="presentation">
            <section aria-label="Game instructions" className={styles.instructionsModal}>
              <div className={styles.modalHeader}>
                <h2>Instructions</h2>
                <button
                  aria-label="Close instructions dialog"
                  className={styles.closeButton}
                  onClick={() => setIsInstructionsOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className={styles.instructionsBody}>
                {isLoadingInstructions ? (
                  <p className={styles.loadingInstructions}>Loading instructions...</p>
                ) : (
                  <InstructionsViewer
                    assetBasePath={`/api/projects/${projectId}/game-assets`}
                    markdown={instructions}
                  />
                )}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className={styles.shell} style={getPlayerAccentStyle(color)}>
      <section className={styles.card}>
        <p className={styles.kicker}>Azure Tides Gaming</p>
        <h1>{joinInfo?.project.name ?? "Join Game"}</h1>

        <form className={styles.joinForm} onSubmit={joinGame} suppressHydrationWarning>
          <input
            aria-label="Player name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            suppressHydrationWarning
            value={name}
          />
          <div className={styles.colors} role="group" aria-label="Avatar color">
            {COLORS.map((nextColor) => (
              <button
                aria-label={`Choose ${nextColor}`}
                className={nextColor === color ? styles.selectedColor : undefined}
                key={nextColor}
                onClick={() => setColor(nextColor)}
                style={{ background: nextColor }}
                type="button"
              />
            ))}
          </div>
          <button disabled={!name.trim() || !joinInfo} type="submit">
            Join
          </button>
        </form>
      </section>
    </main>
  );
}

function getWebSocketCandidates(apiWsUrl: string) {
  const browserProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const sameHostUrl = `${browserProtocol}//${window.location.host}/ws/game`;
  return [...new Set([sameHostUrl, apiWsUrl])];
}

function createPlayerId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing modes can deny storage; the in-memory React state still works for this visit.
  }
}

function getPlayerAccentStyle(color: string): PlayerAccentStyle {
  return {
    "--accent": color,
    "--accent-strong": color,
    "--join-text-color": getReadableTextColor(color)
  };
}

function getReadableTextColor(hexColor: string) {
  const hex = hexColor.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return "#04110f";
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.62 ? "#04110f" : "#ffffff";
}
