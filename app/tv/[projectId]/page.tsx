"use client";

import { use, useEffect, useRef, useState } from "react";
import { Menu, Unplug, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { DEFAULT_GAME_CONFIG, GameConfig, GameSocketMessage, GameState, JoinInfo } from "@/lib/game-types";
import { InstructionsViewer } from "@/components/instructions-viewer";
import styles from "./tv.module.css";

const EMPTY_STATE: GameState = {
  actions: [],
  buzzes: [],
  config: DEFAULT_GAME_CONFIG,
  players: [],
  projectId: "",
  prompt: ""
};

type PageParams = Promise<{ projectId: string }>;
type ActionFeedback = {
  id: number;
  label: string;
  tone: "good" | "info" | "warning";
};

export default function TVPage({ params }: { params: PageParams }) {
  const { projectId } = isPromise(params) ? use(params) : params;
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [gameState, setGameState] = useState<GameState>(EMPTY_STATE);
  const [connectionState, setConnectionState] = useState("Connecting");
  const [error, setError] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlayersModalOpen, setIsPlayersModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStateRef = useRef({
    actionCount: 0,
    buzzCount: 0,
    hasSeenState: false,
    players: new Map<string, boolean>()
  });

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    async function loadJoinInfo() {
      setError("");
      try {
        const response = await fetch(`/api/game/${projectId}/join-info`, { cache: "no-store" });
        const data = (await response.json()) as JoinInfo & { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Unable to load game.");
        }
        if (!cancelled) {
          setJoinInfo(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load game.");
        }
      }
    }

    void loadJoinInfo();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!joinInfo || !projectId) {
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const config = joinInfo.config;
    const wsUrl = joinInfo.wsUrl;

    function connect() {
      setConnectionState("Connecting");
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setConnectionState("Live");
        announceFeedback("TV connected", "good");
        socket.send(JSON.stringify({ config, projectId, role: "tv", type: "join" }));
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
        if (!closed) {
          setConnectionState("Reconnecting");
          announceFeedback("Reconnecting", "warning");
          reconnectTimer = setTimeout(connect, 900);
        }
      });
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socketRef.current?.close();
    };
  }, [joinInfo, projectId]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const snapshot = lastStateRef.current;
    const nextPlayers = new Map(gameState.players.map((player) => [player.id, player.connected]));

    if (!snapshot.hasSeenState) {
      snapshot.hasSeenState = true;
      snapshot.players = nextPlayers;
      snapshot.actionCount = gameState.actions.length;
      snapshot.buzzCount = gameState.buzzes.length;
      return;
    }

    const joinedPlayer = gameState.players.find((player) => !snapshot.players.has(player.id));
    if (joinedPlayer) {
      announceFeedback(`${joinedPlayer.name} joined`, "good");
    } else {
      const disconnectedPlayer = gameState.players.find(
        (player) => snapshot.players.get(player.id) === true && !player.connected
      );
      if (disconnectedPlayer) {
        announceFeedback(`${disconnectedPlayer.name} disconnected`, "warning");
      } else if (gameState.buzzes.length > snapshot.buzzCount) {
        const latestBuzz = gameState.buzzes[gameState.buzzes.length - 1];
        announceFeedback(latestBuzz ? `${latestBuzz.name} buzzed` : "Buzz received", "info");
      } else if (gameState.actions.length > snapshot.actionCount) {
        announceFeedback("Player action received", "info");
      }
    }

    snapshot.players = nextPlayers;
    snapshot.actionCount = gameState.actions.length;
    snapshot.buzzCount = gameState.buzzes.length;
  }, [gameState.actions, gameState.buzzes, gameState.players]);

  useEffect(() => {
    postStateToGameFrame();
  }, [connectionState, gameState, joinInfo]);

  useEffect(() => {
    async function handleGameMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const message = event.data as {
        actionType?: unknown;
        config?: unknown;
        payload?: unknown;
        source?: unknown;
        state?: unknown;
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
        send({ actionType: message.actionType, payload: message.payload ?? {}, type: "gameAction" });
        announceFeedback(formatActionFeedback(message.actionType), "info");
        return;
      }

      if (message.type === "setState") {
        send({ state: message.state, type: "setState" });
        announceFeedback("Game state updated", "good");
        return;
      }

      if (message.type === "setConfig") {
        const config = await persistConfig(message.config);
        send({ config, type: "setConfig" });
        announceFeedback("Game settings saved", "good");
      }
    }

    window.addEventListener("message", handleGameMessage);
    return () => window.removeEventListener("message", handleGameMessage);
  }, [gameState, joinInfo]);

  function send(payload: Record<string, unknown>) {
    socketRef.current?.send(JSON.stringify(payload));
  }

  function announceFeedback(label: string, tone: ActionFeedback["tone"] = "info") {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }

    setFeedback({ id: Date.now(), label, tone });
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
  }

  async function persistConfig(configPatch: unknown) {
    if (!projectId) {
      return joinInfo?.config ?? DEFAULT_GAME_CONFIG;
    }

    const response = await fetch(`/api/game/${projectId}/config`, {
      body: JSON.stringify({ config: configPatch }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const data = (await response.json()) as { config?: GameConfig; error?: string };
    if (!response.ok || !data.config) {
      throw new Error(data.error || "Unable to update game config.");
    }
    setJoinInfo((current) => (current ? { ...current, config: data.config as GameConfig } : current));
    return data.config;
  }

  function postStateToGameFrame() {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "atg-shell",
        state: {
          ...gameState,
          config: gameState.config ?? joinInfo?.config ?? DEFAULT_GAME_CONFIG,
          connectionState,
          player: null,
          project: joinInfo?.project ?? null,
          role: "tv"
        },
        type: "state"
      },
      "*"
    );
  }

  function openJoinModal() {
    setIsMenuOpen(false);
    setIsJoinModalOpen(true);
    announceFeedback("Join QR ready", "info");
  }

  function openPlayersModal() {
    setIsMenuOpen(false);
    setIsPlayersModalOpen(true);
    announceFeedback("Player list opened", "info");
  }

  async function openInstructionsModal() {
    setIsMenuOpen(false);
    setIsInstructionsModalOpen(true);
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
      setIsInstructionsModalOpen(false);
    } finally {
      setIsLoadingInstructions(false);
    }
  }

  function disconnectPlayer(playerId: string) {
    send({ playerId, type: "disconnectPlayer" });
    announceFeedback("Disconnect sent", "warning");
  }

  const editorHref = `/dashboard?project=${encodeURIComponent(projectId)}`;
  const joinHref = `/join/${encodeURIComponent(projectId)}`;

  if (error) {
    return (
      <main className={styles.screen}>
        <section className={styles.errorPanel}>{error}</section>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1>{joinInfo?.project.name ?? "Loading game..."}</h1>
        </div>
        <div className={styles.headerActions}>
          <button
            aria-expanded={isMenuOpen}
            aria-label="Open TV menu"
            className={styles.menuButton}
            onClick={() => setIsMenuOpen((current) => !current)}
            type="button"
          >
            <Menu aria-hidden="true" />
          </button>
          {isMenuOpen ? (
            <div className={styles.menu} role="menu">
              <a href="/dashboard" role="menuitem">
                Dashboard
              </a>
              <a href={editorHref} role="menuitem">
                Edit Project
              </a>
              <a href={joinHref} role="menuitem">
                Open Phone
              </a>
              <button onClick={openJoinModal} role="menuitem" type="button">
                Show Join QR
              </button>
              <button onClick={openPlayersModal} role="menuitem" type="button">
                Show Players
              </button>
              <button onClick={openInstructionsModal} role="menuitem" type="button">
                Instructions
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <section className={styles.grid}>
        <section className={styles.gameFramePanel}>
          <iframe
            onLoad={postStateToGameFrame}
            ref={iframeRef}
            sandbox="allow-scripts"
            src={projectId ? `/api/projects/${projectId}/game-assets/tv.html` : undefined}
            title="Project TV game interface"
          />
        </section>
      </section>

      {feedback ? <FeedbackToast feedback={feedback} /> : null}

      {isJoinModalOpen ? (
        <div className={styles.modalOverlay} role="presentation">
          <section aria-label="Join game QR code" className={styles.joinModal}>
            <div className={styles.modalHeader}>
              <h2>Join Game</h2>
              <button
                aria-label="Close join dialog"
                className={styles.closeButton}
                onClick={() => setIsJoinModalOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className={styles.qrBox}>
              {joinInfo ? <QRCodeSVG bgColor="#ffffff" fgColor="#071014" size={260} value={joinInfo.joinUrl} /> : null}
            </div>
            <PlayerList onDisconnect={disconnectPlayer} players={gameState.players} />
          </section>
        </div>
      ) : null}

      {isPlayersModalOpen ? (
        <div className={styles.modalOverlay} role="presentation">
          <section aria-label="Connected players" className={styles.joinModal}>
            <div className={styles.modalHeader}>
              <h2>Players</h2>
              <button
                aria-label="Close players dialog"
                className={styles.closeButton}
                onClick={() => setIsPlayersModalOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <PlayerList onDisconnect={disconnectPlayer} players={gameState.players} />
          </section>
        </div>
      ) : null}

      {isInstructionsModalOpen ? (
        <div className={styles.modalOverlay} role="presentation">
          <section aria-label="Game instructions" className={`${styles.joinModal} ${styles.instructionsModal}`}>
            <div className={styles.modalHeader}>
              <h2>Instructions</h2>
              <button
                aria-label="Close instructions dialog"
                className={styles.closeButton}
                onClick={() => setIsInstructionsModalOpen(false)}
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

function FeedbackToast({ feedback }: { feedback: ActionFeedback }) {
  return (
    <div
      className={`${styles.feedbackToast} ${styles[feedback.tone]}`}
      key={feedback.id}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      <strong>{feedback.label}</strong>
    </div>
  );
}

function formatActionFeedback(actionType: string) {
  const label = actionType
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();

  return label ? `${capitalize(label)} sent` : "Action sent";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPromise(value: PageParams): value is Promise<{ projectId: string }> {
  return "then" in value;
}

function PlayerList({
  onDisconnect,
  players
}: {
  onDisconnect: (playerId: string) => void;
  players: GameState["players"];
}) {
  return (
    <section className={styles.playersSection}>
      <div className={styles.playerList}>
        {players.length === 0 ? <p>No players yet.</p> : null}
        {players.map((player) => (
          <article className={styles.playerCard} key={player.id}>
            <span style={{ background: player.color }} />
            <div>
              <strong>{player.name}</strong>
              <p>{player.connected ? "Connected" : "Disconnected"}</p>
            </div>
            <button
              aria-label={`Disconnect ${player.name}`}
              className={styles.disconnectButton}
              onClick={() => onDisconnect(player.id)}
              type="button"
            >
              <Unplug aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
