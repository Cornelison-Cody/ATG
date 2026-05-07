import os from "os";
import { getPublicBaseUrl } from "./env";

export function getLocalIPv4Address() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  return "localhost";
}

export function getGameUrls(projectId: string, port = 3000) {
  const publicBaseUrl = getPublicBaseUrl();
  if (publicBaseUrl) {
    const url = new URL(publicBaseUrl);
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return {
      joinUrl: `${publicBaseUrl}/join/${projectId}`,
      wsUrl: `${wsProtocol}//${url.host}/ws/game`
    };
  }

  const host = getLocalIPv4Address();
  return {
    joinUrl: `http://${host}:${port}/join/${projectId}`,
    wsUrl: `ws://${host}:${port}/ws/game`
  };
}
