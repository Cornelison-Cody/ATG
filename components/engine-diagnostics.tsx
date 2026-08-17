"use client";

import { RefObject, useEffect, useState } from "react";
import styles from "./engine-diagnostics.module.css";

type DiagnosticsPayload = {
  status: "ready" | "sample";
  fps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  renderer: string;
  resolution: number;
  logicalSize: { width: number; height: number } | null;
  assetFailures: number;
  audioFailures: number;
  engineErrors: number;
  lastError: string;
  warnings: string[];
};

export function EngineDiagnostics({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.source !== "atg-game" || event.data?.type !== "engineDiagnostics") return;
      const payload = event.data.payload;
      if (!isDiagnosticsPayload(payload)) return;
      setDiagnostics(payload);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [frameRef]);

  if (!diagnostics) return null;

  const hasFailures = diagnostics.assetFailures + diagnostics.audioFailures + diagnostics.engineErrors > 0;
  const frameWarning = diagnostics.p95FrameTimeMs > 1000 / 30;
  return (
    <section aria-label="Engine diagnostics" className={styles.panel}>
      <div className={styles.heading}>
        <span>Preview diagnostics</span>
        <span className={styles.live}><i aria-hidden="true" />Live</span>
      </div>
      <div className={styles.metrics}>
        <Metric label="FPS" value={diagnostics.fps.toFixed(0)} warning={diagnostics.fps > 0 && diagnostics.fps < 30} />
        <Metric label="Frame p95" value={`${diagnostics.p95FrameTimeMs.toFixed(1)} ms`} warning={frameWarning} />
        <Metric label="Renderer" value={diagnostics.renderer} />
        <Metric label="Assets" value={diagnostics.assetFailures ? `${diagnostics.assetFailures} failed` : "OK"} warning={diagnostics.assetFailures > 0} />
        <Metric label="Audio" value={diagnostics.audioFailures ? `${diagnostics.audioFailures} failed` : "OK"} warning={diagnostics.audioFailures > 0} />
      </div>
      {diagnostics.warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {diagnostics.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : hasFailures ? (
        <p className={styles.note}>{diagnostics.lastError}</p>
      ) : (
        <p className={styles.note}>No engine warnings in this editing session.</p>
      )}
    </section>
  );
}

function isDiagnosticsPayload(value: unknown): value is DiagnosticsPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<DiagnosticsPayload>;
  return (
    (payload.status === "ready" || payload.status === "sample") &&
    typeof payload.fps === "number" && Number.isFinite(payload.fps) &&
    typeof payload.frameTimeMs === "number" && Number.isFinite(payload.frameTimeMs) &&
    typeof payload.p95FrameTimeMs === "number" && Number.isFinite(payload.p95FrameTimeMs) &&
    typeof payload.renderer === "string" &&
    typeof payload.resolution === "number" && Number.isFinite(payload.resolution) &&
    typeof payload.assetFailures === "number" && Number.isFinite(payload.assetFailures) &&
    typeof payload.audioFailures === "number" && Number.isFinite(payload.audioFailures) &&
    typeof payload.engineErrors === "number" && Number.isFinite(payload.engineErrors) &&
    typeof payload.lastError === "string" &&
    Array.isArray(payload.warnings) && payload.warnings.every((warning) => typeof warning === "string")
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={warning ? styles.metricWarning : styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
